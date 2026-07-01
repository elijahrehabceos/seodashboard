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

if (!SE_RANKING_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing required env vars. Check GitHub Actions secrets.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const SE_BASE = "https://api.seranking.com/v1/project-management";
const LF_BASE = "https://api.localfalcon.com";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoISO(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
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

  const rows = [];
  for (const engineBlock of positions) {
    const siteEngineId = engineBlock.site_engine_id;
    for (const kw of engineBlock.keywords || []) {
      const latest = (kw.positions || []).slice(-1)[0];
      if (!latest) continue;
      rows.push({
        client_slug: client.slug,
        keyword: keywordNameById.get(String(kw.id)) || `keyword_${kw.id}`,
        position: latest.pos ?? null,
        position_change: latest.change ?? null,
        site_engine_id: siteEngineId,
        checked_date: latest.date,
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
  const dateFrom = daysAgoISO(30); // "mentioned once this month" rule

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

    for (const item of rankings.items || []) {
      for (const p of item.positions || []) {
        totalChecks += 1;
        if (p.mention_position && p.mention_position > 0) {
          mentionedAtLeastOnce = true;
          mentionedChecks += 1;
        }
      }
    }

    rows.push({
      client_slug: client.slug,
      engine: engine.base_name,
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

  const list = await lfPost("/v1/reports/", {
    place_id: client.local_falcon_place_id,
    limit: "20",
  });

  const reports = list?.data?.reports || [];
  if (!reports.length) return 0;

  // group by keyword, keep the most recent report per keyword
  const latestByKeyword = new Map();
  for (const r of reports) {
    const existing = latestByKeyword.get(r.keyword);
    if (!existing || Number(r.timestamp) > Number(existing.timestamp)) {
      latestByKeyword.set(r.keyword, r);
    }
  }

  const rows = [];
  for (const r of latestByKeyword.values()) {
    rows.push({
      client_slug: client.slug,
      keyword: r.keyword,
      location_label: r.location?.name || client.clinic_name,
      arp: isFinite(Number(r.arp)) ? Number(r.arp) : null,
      atrp: isFinite(Number(r.atrp)) ? Number(r.atrp) : null,
      solv: isFinite(Number(r.solv)) ? Number(r.solv) : null,
      heatmap_url: r.heatmap || r.image || null,
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
  }
  return rows.length;
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

async function main() {
  let successCount = 0;
  let failCount = 0;
  const errors = [];

  for (const client of clients) {
    try {
      await upsertClientRecord(client);
      const kwCount = await refreshKeywordRankings(client);
      const aiCount = await refreshAiVisibility(client);
      const lfCount = await refreshLocalPack(client);
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
