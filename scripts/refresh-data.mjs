// Daily refresh script — run by GitHub Actions on a cron schedule.
// Pulls keyword rankings + AI visibility from SE Ranking, and local pack
// data from Local Falcon (for clients that have a local_falcon_place_id set),
// then writes everything into Supabase.
//
// Required env vars (set as GitHub Actions secrets):
//   SE_RANKING_API_KEY
//   LOCAL_FALCON_API_KEY
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "@supabase/supabase-js";
import clients from "../data/clients.json" with { type: "json" };

const SE_RANKING_KEY = process.env.SE_RANKING_API_KEY;
const LOCAL_FALCON_KEY = process.env.LOCAL_FALCON_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY; // optional — insights skipped if absent

if (!SE_RANKING_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing required env vars. Check GitHub Actions secrets.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const SE_BASE = "https://api.seranking.com/v1/project-management";
const LF_BASE = "https://api.localfalcon.com";

// Manual overrides: for these clients, force the primary keyword to the one
// containing this text, instead of trusting the lowest-ID auto-detection.
// Matched case-insensitively as a substring against the keyword name.
const PRIMARY_KEYWORD_OVERRIDES = {
  "avila-pt": "corpus christi",
  "body-moksha-pt": "chatham",
  "focus-pt": "louisville",
  "mid-county-pt": "woodbridge",
  "pt-group-of-florida": "fort lauderdale",
  "back-worx": "bradenton",
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoISO(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function mondayOfCurrentWeek() {
  const d = new Date();
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = (day === 0 ? -6 : 1) - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

async function seGet(path, params = {}) {
  const url = new URL(`${SE_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  });
  const res = await fetch(url, {
    headers: { Authorization: `Token ${SE_RANKING_KEY}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`SE Ranking ${path} failed: ${res.status} ${body}`);
  }
  return res.json();
}

async function lfPost(path, form = {}) {
  const body = new URLSearchParams({ api_key: LOCAL_FALCON_KEY, ...form });
  const res = await fetch(`${LF_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.success === false) {
    throw new Error(`Local Falcon ${path} failed: ${res.status} ${json?.message || ""}`);
  }
  return json;
}

async function refreshKeywordRankings(client) {
  const dateTo = todayISO();
  const dateFrom = daysAgoISO(7);

  const positions = await seGet("/sites/positions", {
    site_id: client.site_id,
    date_from: dateFrom,
    date_to: dateTo,
  });

  const keywordsList = await seGet("/keywords", { site_id: client.site_id });
  const keywordNameById = new Map(keywordsList.map((k) => [String(k.id), k.name]));

  // Determine the primary keyword: use the manual override if one exists
  // for this client, otherwise fall back to the lowest keyword ID (the
  // first one ever added to the project in SE Ranking).
  let primaryKeywordId = null;
  const overrideText = PRIMARY_KEYWORD_OVERRIDES[client.slug];
  if (overrideText) {
    const match = keywordsList.find((k) =>
      k.name.toLowerCase().includes(overrideText.toLowerCase())
    );
    if (match) primaryKeywordId = String(match.id);
  }
  if (!primaryKeywordId && keywordsList.length) {
    primaryKeywordId = String(Math.min(...keywordsList.map((k) => k.id)));
  }

  const weekStart = mondayOfCurrentWeek();

  const rows = [];
  for (const engineBlock of positions) {
    const siteEngineId = engineBlock.site_engine_id;
    for (const kw of engineBlock.keywords || []) {
      const historyThisRun = kw.positions || [];
      const latest = historyThisRun.slice(-1)[0];
      if (!latest) continue;
      const keywordName = keywordNameById.get(String(kw.id)) || `keyword_${kw.id}`;
      const currentPos = latest.pos ?? null;

      // Compute "best position this week" straight from SE Ranking's own
      // historical entries (the API already returns up to 7 days per call,
      // which safely covers Monday-to-today since a week is only 7 days).
      // This is recomputed fresh every run rather than trusted from a
      // previous run's stored value, so it can't drift if a day is missed.
      const thisWeeksEntries = historyThisRun.filter(
        (p) => p.date >= weekStart && p.pos && p.pos > 0
      );
      const bestPositionWeek = thisWeeksEntries.length
        ? Math.min(...thisWeeksEntries.map((p) => p.pos))
        : currentPos && currentPos > 0
        ? currentPos
        : null;

      rows.push({
        client_slug: client.slug,
        keyword: keywordName,
        position: currentPos,
        position_change: latest.change ?? null,
        site_engine_id: siteEngineId,
        checked_date: latest.date,
        best_position_week: bestPositionWeek,
        week_start: weekStart,
        is_primary: String(kw.id) === primaryKeywordId,
        updated_at: new Date().toISOString(),
      });
    }
  }

  if (rows.length) {
    const { error } = await supabase
      .from("keyword_rankings")
      .upsert(rows, { onConflict: "client_slug,keyword,site_engine_id" });
    if (error) throw error;
  }
  return rows.length;
}

async function refreshSearchEngines(client) {
  let engines;
  try {
    engines = await seGet("/sites/search-engines", { site_id: client.site_id });
  } catch (e) {
    return 0;
  }
  if (!Array.isArray(engines) || engines.length === 0) return 0;

  const rows = engines.map((e) => ({
    client_slug: client.slug,
    site_engine_id: e.site_engine_id,
    region_name: e.region_name || null,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("search_engines")
    .upsert(rows, { onConflict: "client_slug,site_engine_id" });
  if (error) throw error;
  return rows.length;
}

async function refreshAiVisibility(client) {
  let engines;
  try {
    engines = await seGet("/airt/llm", { site_id: client.site_id });
  } catch (e) {
    // No brand/AI tracking configured for this client — skip quietly.
    return 0;
  }
  if (!Array.isArray(engines) || engines.length === 0) return 0;

  const dateTo = todayISO();
  // Calendar month, not a rolling window — matches the report rule:
  // "mentioned once in the month = mentioned", tied to the actual month,
  // not just the last 30 days.
  const now = new Date();
  const dateFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);

  const rows = [];
  for (const engine of engines) {
    let rankings;
    try {
      rankings = await seGet("/airt/prompts/rankings", {
        site_id: client.site_id,
        llm_id: engine.id,
        date_from: dateFrom,
        date_to: dateTo,
        limit: 1000,
      });
    } catch (e) {
      continue;
    }

    let mentionedAtLeastOnce = false;
    let totalChecks = 0;
    let mentionedChecks = 0;
    let promptText = null;

    for (const item of rankings.items || []) {
      if (!promptText) promptText = item.keyword || null; // the tracked prompt itself
      for (const p of item.positions || []) {
        if (p.mention_position === null || p.mention_position === undefined) continue; // no AI block that day
        totalChecks += 1;
        if (p.mention_position > 0) {
          mentionedAtLeastOnce = true;
          mentionedChecks += 1;
        }
      }
    }

    rows.push({
      client_slug: client.slug,
      engine: engine.base_name,
      prompt: promptText,
      mentioned: mentionedAtLeastOnce,
      mention_percent: totalChecks ? Math.round((mentionedChecks / totalChecks) * 100) : null,
      link_percent: null,
      last_checked: dateTo,
      updated_at: new Date().toISOString(),
    });
  }

  if (rows.length) {
    const { error } = await supabase
      .from("ai_visibility")
      .upsert(rows, { onConflict: "client_slug,engine" });
    if (error) throw error;
  }
  return rows.length;
}

async function refreshLocalPack(client) {
  if (!client.local_falcon_place_id) return 0; // not mapped yet

  const placeIds = client.local_falcon_place_id.split(",").map((s) => s.trim()).filter(Boolean);
  let totalRows = 0;

  for (const placeId of placeIds) {
    let list;
    try {
      list = await lfPost("/v1/reports/", {
        place_id: placeId,
        limit: "20",
      });
    } catch (err) {
      console.error(`[local pack skip] ${client.clinic_name} (${placeId}):`, err.message);
      continue; // this location has no data yet or failed — don't let it block the others
    }

    // Defensive: handle either envelope shape Local Falcon's API might use.
    const reports = list?.data?.reports || list?.reports || [];
    if (!reports.length) continue;

    // group by keyword, keep the most recent report per keyword for this location.
    // Real reports use a "date" string field (e.g. "6/11/2026 8:00 AM"), not
    // "timestamp" — comparing on a nonexistent field always failed silently
    // and left the group stuck on whichever report came first in the array.
    const latestByKeyword = new Map();
    for (const r of reports) {
      const existing = latestByKeyword.get(r.keyword);
      const rTime = new Date(r.date).getTime();
      const existingTime = existing ? new Date(existing.date).getTime() : -Infinity;
      if (!existing || rTime > existingTime) {
        latestByKeyword.set(r.keyword, r);
      }
    }

    const rows = [];
    for (const r of latestByKeyword.values()) {
      rows.push({
        client_slug: client.slug,
        keyword: r.keyword,
        location_label: r.location?.name || `${client.clinic_name} (${placeId.slice(-6)})`,
        arp: isFinite(Number(r.arp)) ? Number(r.arp) : null,
        atrp: isFinite(Number(r.atrp)) ? Number(r.atrp) : null,
        solv: isFinite(Number(r.solv)) ? Number(r.solv) : null,
        heatmap_url: r.image || r.heatmap || null,
        report_key: r.report_key,
        scan_date: r.date ? new Date(r.date).toISOString().slice(0, 10) : null,
        updated_at: new Date().toISOString(),
      });
    }

    if (rows.length) {
      const { error } = await supabase
        .from("local_pack")
        .upsert(rows, { onConflict: "client_slug,keyword,location_label" });
      if (error) throw error;
      totalRows += rows.length;
    }

    await new Promise((r) => setTimeout(r, 200)); // pace multi-location lookups
  }

  return totalRows;
}

async function upsertClientRecord(client) {
  const { error } = await supabase.from("clients").upsert(
    {
      slug: client.slug,
      clinic_name: client.clinic_name,
      owner_name: client.owner_name,
      domain: client.domain,
      site_id: client.site_id,
      local_falcon_place_id: client.local_falcon_place_id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "slug" }
  );
  if (error) throw error;
}

async function generateInsight(client) {
  if (!ANTHROPIC_API_KEY) return; // feature not configured yet

  const [{ data: keywords }, { data: ai }, { data: local }] = await Promise.all([
    supabase.from("keyword_rankings").select("*").eq("client_slug", client.slug),
    supabase.from("ai_visibility").select("*").eq("client_slug", client.slug),
    supabase.from("local_pack").select("*").eq("client_slug", client.slug),
  ]);

  const prompt = `You are an SEO analyst writing a short internal note for an agency
dashboard card. Clinic: ${client.clinic_name}.

Keyword rankings: ${JSON.stringify(keywords)}
AI visibility: ${JSON.stringify(ai)}
Local pack: ${JSON.stringify(local)}

Write 2-3 plain sentences (no markdown, no headers) summarizing what's going
well and what needs attention. Be specific with numbers where useful. No
em dashes. This is for internal agency use, not client-facing.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const json = await res.json();
    const blurb = json?.content?.find((b) => b.type === "text")?.text?.trim();
    if (!blurb) return;

    const { error } = await supabase
      .from("client_insights")
      .upsert(
        { client_slug: client.slug, blurb, generated_at: new Date().toISOString() },
        { onConflict: "client_slug" }
      );
    if (error) throw error;
  } catch (err) {
    console.error(`[insight fail] ${client.clinic_name}:`, err.message);
  }
}

async function main() {
  let successCount = 0;
  let failCount = 0;
  const errors = [];

  for (const client of clients) {
    try {
      await upsertClientRecord(client);
      await refreshSearchEngines(client);
      const kwCount = await refreshKeywordRankings(client);
      const aiCount = await refreshAiVisibility(client);
      const lfCount = await refreshLocalPack(client);
      await generateInsight(client);
      console.log(
        `[ok] ${client.clinic_name}: ${kwCount} keywords, ${aiCount} AI engines, ${lfCount} local pack rows`
      );
      successCount += 1;
    } catch (err) {
      console.error(`[fail] ${client.clinic_name}:`, err.message);
      errors.push(`${client.clinic_name}: ${err.message}`);
      failCount += 1;
    }
    // gentle pacing to stay under SE Ranking's 5 req/sec limit
    await new Promise((r) => setTimeout(r, 300));
  }

  await supabase.from("refresh_log").insert({
    status: failCount === 0 ? "success" : successCount > 0 ? "partial" : "failed",
    details: `${successCount} ok, ${failCount} failed. ${errors.slice(0, 10).join(" | ")}`,
  });

  console.log(`Done. ${successCount} succeeded, ${failCount} failed.`);
  if (failCount > 0 && successCount === 0) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
