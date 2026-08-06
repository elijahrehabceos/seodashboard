// Daily refresh script — run by GitHub Actions on a cron schedule.
// Pulls keyword rankings AND AI visibility from two dedicated Google Sheet
// tabs (published to web as CSV — this replaces both SE Ranking's rank
// tracking AND its AI Result Tracker). Local pack data still comes from
// Local Falcon. Everything gets written into Supabase.
//
// Required env vars (set as GitHub Actions secrets):
//   GOOGLE_SHEET_KEYWORDS_CSV_URL
//   GOOGLE_SHEET_AI_CSV_URL
//   LOCAL_FALCON_API_KEY
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   ANTHROPIC_API_KEY (optional)

import { createClient } from "@supabase/supabase-js";
import Papa from "papaparse";
import clientsSeed from "../data/clients.json" with { type: "json" };

const GOOGLE_SHEET_KEYWORDS_CSV_URL = process.env.GOOGLE_SHEET_KEYWORDS_CSV_URL;
const GOOGLE_SHEET_AI_CSV_URL = process.env.GOOGLE_SHEET_AI_CSV_URL;
const LOCAL_FALCON_KEY = process.env.LOCAL_FALCON_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY; // optional — insights skipped if absent

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing required env vars. Check GitHub Actions secrets.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

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

function parseYN(raw) {
  const s = String(raw ?? "").trim().toUpperCase();
  if (s === "Y") return true;
  if (s === "N") return false;
  return null; // blank / unrecognized — leave unset rather than guess
}

async function fetchCsv(url, label) {
  if (!url) {
    console.error(`${label} URL not set — skipping.`);
    return [];
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${label}: ${res.status}`);
  const text = await res.text();
  const parsed = Papa.parse(text.trim(), { header: true, skipEmptyLines: true });
  return parsed.data;
}

// This is now Elijah's own dedicated sheet (not shared with other team
// members), so no more owner-name allowlisting needed — any Clinic Name in
// here is one of ours.
async function fetchKeywordSheet() {
  const rows = await fetchCsv(GOOGLE_SHEET_KEYWORDS_CSV_URL, "Keyword Rankings sheet");
  const byClinic = new Map();
  for (const row of rows) {
    const clinicName = (row["Clinic Name"] || "").trim();
    if (!clinicName) continue;
    const key = normalizeName(clinicName);
    if (!byClinic.has(key)) {
      byClinic.set(key, {
        clinicName,
        domain: (row["Domain"] || "").trim(),
        ownerName: (row["Owner Name"] || "").trim(),
        entries: [],
      });
    }
    byClinic.get(key).entries.push({
      keyword: (row["Keyword"] || "").trim(),
      locationLabel: (row["Location"] || "").trim() || null,
      isPrimary: (row["Primary? (Y/N)"] || "").trim().toUpperCase() === "Y",
      organic: parsePosition(row["Organic Position"]),
      maps: parsePosition(row["Maps Position"]),
    });
  }
  return byClinic;
}

async function fetchAiSheet() {
  const rows = await fetchCsv(GOOGLE_SHEET_AI_CSV_URL, "AI Visibility sheet");
  const byClinic = new Map();
  for (const row of rows) {
    const clinicName = (row["Clinic Name"] || "").trim();
    if (!clinicName) continue;
    const key = normalizeName(clinicName);
    if (!byClinic.has(key)) byClinic.set(key, []);
    byClinic.get(key).push({
      locationLabel: (row["Location"] || "").trim() || null,
      prompt: (row["Tracked Prompt"] || "").trim() || null,
      mentioned: parseYN(row["Mentioned This Month? (Y/N)"]),
    });
  }
  return byClinic;
}

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// Any clinic in the sheet that doesn't match an existing client becomes a
// new client automatically — no manual "add this client" step needed.
function buildFullClientList(keywordSheet, existingClients) {
  const matchedKeys = new Set();
  for (const client of existingClients) {
    const norm = normalizeName(client.clinic_name);
    if (keywordSheet.has(norm)) {
      matchedKeys.add(norm);
      continue;
    }
    for (const key of keywordSheet.keys()) {
      if (key.includes(norm) || norm.includes(key)) {
        matchedKeys.add(key);
        break;
      }
    }
  }

  const autoDetected = [];
  for (const [key, { clinicName, domain, ownerName }] of keywordSheet) {
    if (matchedKeys.has(key)) continue;
    autoDetected.push({
      slug: slugify(clinicName),
      clinic_name: clinicName,
      owner_name: ownerName || "Unknown",
      domain: domain || "",
      site_id: null,
      local_falcon_place_id: null,
      auto_detected: true,
    });
  }

  if (autoDetected.length) {
    console.log(
      `Auto-detected ${autoDetected.length} new client(s) from the sheet not yet in our roster: ${autoDetected
        .map((c) => c.clinic_name)
        .join(", ")}`
    );
  }

  return [...existingClients, ...autoDetected];
}

function findInSheet(sheetMap, client) {
  const norm = normalizeName(client.clinic_name);
  if (sheetMap.has(norm)) return sheetMap.get(norm);
  for (const [key, value] of sheetMap) {
    if (key.includes(norm) || norm.includes(key)) return value;
  }
  return null;
}

async function refreshKeywordRankingsFromSheet(client, keywordSheet) {
  const clientData = findInSheet(keywordSheet, client);
  if (!clientData || !clientData.entries.length) return 0;

  const weekStart = mondayOfCurrentWeek();
  const today = todayISO();

  // Pull existing rows once so we can compute position_change vs last update.
  const { data: existingRows } = await supabase
    .from("keyword_rankings")
    .select("keyword,ranking_type,position")
    .eq("client_slug", client.slug);
  const existingMap = new Map((existingRows || []).map((r) => [`${r.keyword}::${r.ranking_type}`, r.position]));

  const rows = [];
  for (const entry of clientData.entries) {
    if (!entry.keyword) continue;
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

    // Log this week into the permanent history table too — this one never
    // gets overwritten, so months from now you can see exactly where each
    // client stood week by week.
    const historyRows = rows
      .filter((r) => r.position != null)
      .map((r) => ({
        client_slug: r.client_slug,
        keyword: r.keyword,
        ranking_type: r.ranking_type,
        location_label: r.location_label,
        week_start: r.week_start,
        position: r.position,
      }));
    if (historyRows.length) {
      const { error: histError } = await supabase
        .from("keyword_week_snapshots")
        .upsert(historyRows, { onConflict: "client_slug,keyword,ranking_type,week_start" });
      if (histError) console.error(`[history log fail] ${client.clinic_name}:`, histError.message);
    }
  }
  return rows.length;
}

async function refreshAiVisibilityFromSheet(client, aiSheet) {
  const entries = findInSheet(aiSheet, client);
  if (!entries || !entries.length) return 0;

  const now = new Date();
  const monthCode = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  const rows = entries
    .filter((e) => e.mentioned !== null) // skip blanks rather than guess
    .map((e) => ({
      client_slug: client.slug,
      engine: "AI Search", // the sheet doesn't distinguish specific engines — one combined check per location
      location_label: e.locationLabel,
      prompt: e.prompt,
      mentioned: e.mentioned,
      mention_percent: e.mentioned ? 100 : 0,
      last_checked: todayISO(),
      updated_at: new Date().toISOString(),
    }));

  if (rows.length) {
    const { error } = await supabase
      .from("ai_visibility")
      .upsert(rows, { onConflict: "client_slug,engine,location_label" });
    if (error) throw error;

    const historyRows = rows.map((r) => ({
      client_slug: r.client_slug,
      engine: r.engine,
      prompt: r.prompt,
      mentioned: r.mentioned,
      month_code: monthCode,
    }));
    const { error: histError } = await supabase
      .from("ai_mention_month_snapshots")
      .upsert(historyRows, { onConflict: "client_slug,engine,month_code" });
    if (histError) console.error(`[AI history log fail] ${client.clinic_name}:`, histError.message);
  }
  return rows.length;
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

  let keywordSheet, aiSheet;
  try {
    keywordSheet = await fetchKeywordSheet();
    console.log(`Loaded Keyword Rankings sheet: ${keywordSheet.size} clients found.`);
  } catch (err) {
    console.error("Failed to load Keyword Rankings sheet:", err.message);
    keywordSheet = new Map();
  }
  try {
    aiSheet = await fetchAiSheet();
    console.log(`Loaded AI Visibility sheet: ${aiSheet.size} clients found.`);
  } catch (err) {
    console.error("Failed to load AI Visibility sheet:", err.message);
    aiSheet = new Map();
  }

  const fullClientList = buildFullClientList(keywordSheet, clientsSeed);

  for (const client of fullClientList) {
    try {
      await upsertClientRecord(client);
      const kwCount = await refreshKeywordRankingsFromSheet(client, keywordSheet);
      const aiCount = await refreshAiVisibilityFromSheet(client, aiSheet);
      const lfCount = await refreshLocalPack(client);
      await generateInsight(client);
      await generatePriorityRecommendation(client);
      console.log(
        `[ok] ${client.clinic_name}: ${kwCount} keyword rows, ${aiCount} AI rows, ${lfCount} local pack rows`
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
