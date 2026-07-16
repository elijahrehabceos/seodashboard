// Daily refresh script — run by GitHub Actions on a cron schedule.
// Pulls keyword rankings from a manually-updated Google Sheet (published to
// web as CSV — SE Ranking's API was dropped due to recurring billing
// issues), AI visibility from SE Ranking (still active), and local pack
// data from Local Falcon, then writes everything into Supabase.
//
// Required env vars (set as GitHub Actions secrets):
//   GOOGLE_SHEET_CSV_URL
//   SE_RANKING_API_KEY   (still used for AI Visibility only)
//   LOCAL_FALCON_API_KEY
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "@supabase/supabase-js";
import Papa from "papaparse";
import clients from "../data/clients.json" with { type: "json" };

const GOOGLE_SHEET_CSV_URL = process.env.GOOGLE_SHEET_CSV_URL;
const SE_RANKING_KEY = process.env.SE_RANKING_API_KEY;
const LOCAL_FALCON_KEY = process.env.LOCAL_FALCON_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY; // optional — insights skipped if absent

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing required env vars. Check GitHub Actions secrets.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const SE_BASE = "https://api.seranking.com/v1/project-management";
const LF_BASE = "https://api.localfalcon.com";

function normalizeName(s) {
  return (s || "").toLowerCase().trim().replace(/\s+/g, " ");
}

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

function parsePosition(raw) {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  if (!s || s.toUpperCase() === "N/A" || s === "-") return null;
  const n = parseFloat(s);
  return isFinite(n) && n > 0 ? Math.round(n) : null;
}

// Fetches the published sheet and returns rows keyed by normalized company name.
// Sheet layout (fixed columns, then repeating groups of 3 for extra locations):
//   0: Client Name (owner)   1: GSC   2: Top 5 AI   3: 150/mo
//   4: Main Keyword   5: Organic #1   6: Maps #1   7: Company Name
//   8+: [Location Keyword, Organic #, Maps #] repeating, up to 17 more groups
async function fetchSheetData() {
  if (!GOOGLE_SHEET_CSV_URL) {
    console.error("GOOGLE_SHEET_CSV_URL not set — skipping ranking sheet refresh entirely.");
    return new Map();
  }
  const res = await fetch(GOOGLE_SHEET_CSV_URL);
  if (!res.ok) throw new Error(`Failed to fetch ranking sheet: ${res.status}`);
  const text = await res.text();
  const parsed = Papa.parse(text.trim(), { header: false, skipEmptyLines: true });
  const rows = parsed.data.slice(1); // drop header row — column names aren't unique enough to trust

  const byCompany = new Map();
  for (const row of rows) {
    const companyName = (row[7] || "").trim();
    if (!companyName) continue; // rows with no Company Name aren't part of our roster

    const entries = [];
    const mainKeyword = (row[4] || "").trim();
    if (mainKeyword) {
      entries.push({ keyword: mainKeyword, organic: parsePosition(row[5]), maps: parsePosition(row[6]), isPrimary: true, locationLabel: null });
    }
    for (let i = 0; i < 17; i++) {
      const base = 8 + i * 3;
      const locKeyword = (row[base] || "").trim();
      if (!locKeyword) continue;
      entries.push({
        keyword: locKeyword,
        organic: parsePosition(row[base + 1]),
        maps: parsePosition(row[base + 2]),
        isPrimary: false,
        locationLabel: locKeyword,
      });
    }
    byCompany.set(normalizeName(companyName), entries);
  }
  return byCompany;
}

function findSheetEntriesForClient(sheetData, client) {
  const norm = normalizeName(client.clinic_name);
  if (sheetData.has(norm)) return sheetData.get(norm);
  // Fuzzy fallback — handles cases like "Avi Singh - Precision Physiotherapy..."
  // in the sheet vs "Precision Physiotherapy..." in our records.
  for (const [key, entries] of sheetData) {
    if (key.includes(norm) || norm.includes(key)) return entries;
  }
  return null;
}

async function refreshKeywordRankingsFromSheet(client, sheetData) {
  const entries = findSheetEntriesForClient(sheetData, client);
  if (!entries || entries.length === 0) return 0;

  const weekStart = mondayOfCurrentWeek();
  const today = todayISO();

  // Pull existing rows once so we can compute position_change vs last update.
  const { data: existingRows } = await supabase
    .from("keyword_rankings")
    .select("keyword,ranking_type,position")
    .eq("client_slug", client.slug);
  const existingMap = new Map((existingRows || []).map((r) => [`${r.keyword}::${r.ranking_type}`, r.position]));

  const rows = [];
  for (const entry of entries) {
    for (const [rankingType, pos] of [["organic", entry.organic], ["maps", entry.maps]]) {
      if (pos === null && !existingMap.has(`${entry.keyword}::${rankingType}`)) continue; // never seen and still unranked — skip noise
      const prevPos = existingMap.get(`${entry.keyword}::${rankingType}`);
      const positionChange = prevPos && pos ? prevPos - pos : null;
      rows.push({
        client_slug: client.slug,
        keyword: entry.keyword,
        position: pos,
        position_change: positionChange,
        location_label: entry.locationLabel,
        ranking_type: rankingType,
        checked_date: today,
        best_position_week: pos, // one snapshot per week from the manual sheet — this week's value IS the best/only one
        week_start: weekStart,
        is_primary: entry.isPrimary && rankingType === "organic",
        updated_at: new Date().toISOString(),
      });
    }
  }

  if (rows.length) {
    const { error } = await supabase
      .from("keyword_rankings")
      .upsert(rows, { onConflict: "client_slug,keyword,ranking_type" });
    if (error) throw error;
  }
  return rows.length;
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
        place_id: placeId,
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
        .upsert(rows, { onConflict: "client_slug,place_id,keyword" });
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

async function generatePriorityRecommendation(client) {
  if (!ANTHROPIC_API_KEY) return;

  const [{ data: keywords }, { data: ai }] = await Promise.all([
    supabase.from("keyword_rankings").select("*").eq("client_slug", client.slug),
    supabase.from("ai_visibility").select("*").eq("client_slug", client.slug),
  ]);
  const kws = keywords || [];
  const aiRows = ai || [];

  // Same flagging logic as the Priority Queue page — kept in sync manually
  // since this runs server-side in a different process.
  const reasons = [];
  const primary = kws.find((k) => k.is_primary);
  const primaryBest = primary ? primary.best_position_week ?? primary.position : null;
  if (primary && (!primaryBest || primaryBest > 5)) {
    reasons.push(`Primary keyword "${primary.keyword}" isn't in the Top 5 this week (currently #${primaryBest || "NR"}).`);
  }
  const biggestDrop = kws.filter((k) => k.position_change < 0).sort((a, b) => a.position_change - b.position_change)[0];
  if (biggestDrop && biggestDrop.position_change <= -3) {
    reasons.push(`"${biggestDrop.keyword}" dropped ${Math.abs(biggestDrop.position_change)} positions this week.`);
  }
  if (aiRows.length > 0 && aiRows.every((a) => !a.mentioned)) {
    reasons.push(`Not mentioned on any tracked AI engine (${aiRows.map((a) => a.engine).join(", ")}).`);
  }
  const rankedCount = kws.filter((k) => k.position > 0).length;
  if (kws.length > 0 && rankedCount / kws.length < 0.5) {
    reasons.push(`Only ${rankedCount} of ${kws.length} tracked keywords are ranking at all.`);
  }

  if (reasons.length === 0) {
    // Client is healthy — clear any stale recommendation so it drops off the queue.
    await supabase.from("priority_recommendations").delete().eq("client_slug", client.slug);
    return;
  }

  const score = reasons.length; // simple weight; matches page's rough ordering well enough
  const prompt = `You are an SEO strategist writing a single, specific, actionable
recommendation for an agency team member managing this client's SEO. Clinic:
${client.clinic_name}. Here's what's flagged this week:
${reasons.map((r) => `- ${r}`).join("\n")}

Write ONE concrete next step (1-2 sentences) the team should actually do this
week to address the most important issue above. Be specific (e.g. "refresh
the GBP post cadence", "add 2 local backlinks", "check for a recent
competitor GBP change"), not generic advice. Plain text, no markdown, no em
dashes.`;

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
        max_tokens: 200,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const json = await res.json();
    const recommendation = json?.content?.find((b) => b.type === "text")?.text?.trim();
    if (!recommendation) return;

    await supabase.from("priority_recommendations").upsert(
      {
        client_slug: client.slug,
        score,
        reasons: JSON.stringify(reasons),
        recommendation,
        generated_at: new Date().toISOString(),
      },
      { onConflict: "client_slug" }
    );
  } catch (err) {
    console.error(`[priority rec fail] ${client.clinic_name}:`, err.message);
  }
}

async function main() {
  let successCount = 0;
  let failCount = 0;
  const errors = [];

  let sheetData;
  try {
    sheetData = await fetchSheetData();
    console.log(`Loaded ranking sheet: ${sheetData.size} clients found in sheet.`);
  } catch (err) {
    console.error("Failed to load ranking sheet:", err.message);
    sheetData = new Map();
  }

  for (const client of clients) {
    try {
      await upsertClientRecord(client);
      const kwCount = await refreshKeywordRankingsFromSheet(client, sheetData);
      const aiCount = await refreshAiVisibility(client);
      const lfCount = await refreshLocalPack(client);
      await generateInsight(client);
      await generatePriorityRecommendation(client);
      console.log(
        `[ok] ${client.clinic_name}: ${kwCount} keyword rows, ${aiCount} AI engines, ${lfCount} local pack rows`
      );
      successCount += 1;
    } catch (err) {
      console.error(`[fail] ${client.clinic_name}:`, err.message);
      errors.push(`${client.clinic_name}: ${err.message}`);
      failCount += 1;
    }
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
