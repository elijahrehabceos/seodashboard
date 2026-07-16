// Generates the exact-match monthly HTML report for one client (or all
// clients) using live Supabase data + Claude-written narrative sections,
// then uploads the result to Supabase Storage.
//
// Usage:
//   node scripts/generate-report.mjs            -> generates for every client
//   node scripts/generate-report.mjs some-slug   -> generates for one client
//
// Required env vars (same as refresh-data.mjs):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
//   LOCAL_FALCON_API_KEY (optional — used only for Google rating/reviews)

import { createClient } from "@supabase/supabase-js";
import clientsData from "../data/clients.json" with { type: "json" };

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const LOCAL_FALCON_KEY = process.env.LOCAL_FALCON_API_KEY;

// IMPORTANT: no env-var validation or process.exit() at module load time.
// Next.js imports this module during build-time static analysis (even
// though it never actually runs any code then), and a top-level exit there
// kills the entire Vercel build. Real validation happens lazily, only when
// a report is actually being generated (see generateReportForClient below).
const supabase = createClient(
  SUPABASE_URL || "https://placeholder.supabase.co",
  SUPABASE_SERVICE_KEY || "placeholder-key"
);

function monthLabel(date = new Date()) {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}
function monthCode(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}
function prevMonthInfo(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1));
  return { code: monthCode(d), label: d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }) };
}

function posClass(p) {
  if (!p || p <= 0) return "pnr";
  if (p === 1) return "p1";
  if (p === 2) return "p2";
  if (p === 3) return "p3";
  return "pw";
}
function trendClass(c) {
  if (!c) return "tfl";
  return c > 0 ? "tup" : "tdn";
}
function trendLabel(c) {
  if (!c) return "— flat";
  return c > 0 ? `▲ +${c}` : `▼ ${c}`;
}
function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function askClaude(prompt, maxTokens = 350) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const json = await res.json();
  return json?.content?.find((b) => b.type === "text")?.text?.trim() || "";
}

async function snapshotAndGetPrevious(client, mappedKeywords, code) {
  // Lock in this month's positions (so re-generating the same month's report
  // doesn't shift the baseline), then pull last month's snapshot to compare.
  const currentRows = mappedKeywords
    .filter((k) => k.position != null)
    .map((k) => ({
      client_slug: client.slug,
      keyword: k.keyword,
      ranking_type: k.ranking_type || "organic",
      month_code: code,
      position: k.position,
    }));
  if (currentRows.length) {
    await supabase
      .from("keyword_month_snapshots")
      .upsert(currentRows, { onConflict: "client_slug,keyword,ranking_type,month_code" });
  }

  const prev = prevMonthInfo();
  const { data: prevRows } = await supabase
    .from("keyword_month_snapshots")
    .select("keyword,ranking_type,position")
    .eq("client_slug", client.slug)
    .eq("month_code", prev.code);

  const prevMap = new Map((prevRows || []).map((r) => [`${r.keyword}::${r.ranking_type}`, r.position]));
  return { prevMap, prevLabel: prev.label };
}

async function fetchGoogleRating(client) {
  if (!LOCAL_FALCON_KEY) return null;
  try {
    const body = new URLSearchParams({ api_key: LOCAL_FALCON_KEY, query: client.clinic_name });
    const res = await fetch("https://api.localfalcon.com/v1/locations/", { method: "POST", body });
    const json = await res.json();
    const locations = json?.data?.locations || json?.locations || [];
    // Multiple businesses can share similar names — disambiguate by domain.
    const match =
      locations.find((l) => l.url && client.domain && l.url.includes(client.domain)) || locations[0];
    if (!match || !match.rating) return null;
    return { rating: match.rating, reviews: match.reviews };
  } catch {
    return null; // rating tile just gets omitted — not critical to the report
  }
}

async function getClientReportData(client) {
  const [{ data: keywords }, { data: ai }, { data: local }] = await Promise.all([
    supabase.from("keyword_rankings").select("*").eq("client_slug", client.slug),
    supabase.from("ai_visibility").select("*").eq("client_slug", client.slug),
    supabase.from("local_pack").select("*").eq("client_slug", client.slug),
  ]);
  return { keywords: keywords || [], ai: ai || [], local: local || [] };
}

function renderKpiGrid(kpis) {
  return kpis
    .map(
      (k) => `<div class="kpi"${k.span ? ` style="grid-column:span ${k.span}"` : ""}>
    <div class="kpi-lbl">${esc(k.label)}</div>
    <div class="kpi-val ${k.cls || ""}">${esc(k.value)}</div>
    <div class="kpi-sub">${esc(k.sub)}</div>
  </div>`
    )
    .join("\n");
}

function renderMarketBlock(regionLabel, groupKeywords, insightHtml, prevMap, prevLabel, currLabel) {
  const rows = groupKeywords
    .map((k) => {
      const prevPos = prevMap.get(`${k.keyword}::${k.ranking_type || "organic"}`);
      const currPos = k.position;
      const change = prevPos && currPos ? prevPos - currPos : k.position_change;
      return `<tr><td>${esc(k.keyword)}</td><td class="${posClass(prevPos)}">${
        prevPos && prevPos > 0 ? prevPos : "—"
      }</td><td class="${posClass(currPos)}">${
        currPos && currPos > 0 ? currPos : "NR"
      }</td><td class="${trendClass(change)}">${trendLabel(change)}</td></tr>`;
    })
    .join("\n");
  const bestPos = groupKeywords.filter((k) => k.position > 0).sort((a, b) => a.position - b.position)[0];
  const badge =
    bestPos && bestPos.position <= 3
      ? `<span class="mkt-badge top3">Top 3</span>`
      : `<span class="mkt-badge opp">Growth Opportunity</span>`;

  return `<div class="market-block">
  <div class="mkt-hdr"><div><span class="mkt-name">${esc(regionLabel)}</span></div>${badge}</div>
  <table class="rtable">
    <thead><tr><th>Keyword</th><th>${esc(prevLabel)}</th><th>${esc(currLabel)}</th><th>Trend</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="insight">
    <div class="insight-lbl"><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="#cda158" stroke-width="1.5"/><path d="M8 5v4M8 11v.5" stroke="#cda158" stroke-width="1.5" stroke-linecap="round"/></svg> ${esc(
    regionLabel
  )} — This Month</div>
    <p>${insightHtml}</p>
  </div>
</div>`;
}

function renderLocalPackCard(l) {
  return `<div class="lp-card">
  <div class="lp-hdr">
    <div class="lp-city"><div class="lp-city-name">${esc(l.location_label)}</div><div class="lp-city-sub">${esc(
    l.keyword
  )}</div></div>
    <div class="lp-stat"><div class="lp-stat-lbl">Avg. Rank (ARP)</div><div class="lp-stat-val ${
      l.arp && l.arp <= 3 ? "good" : "opp"
    }">${l.arp ?? "—"}</div></div>
  </div>
  <div class="map-wrap">
    ${
      l.heatmap_url
        ? `<img class="lp-heatmap" src="${esc(l.heatmap_url)}" alt="Local Falcon heatmap — ${esc(l.location_label)}">`
        : `<div style="padding:32px;text-align:center;color:#999;font-size:12.5px">Heatmap not available yet for this location.</div>`
    }
  </div>
  <div class="lp-foot">
    <div class="lp-kw">Keyword: <span>${esc(l.keyword)}</span></div>
    <div class="legend">
      <div class="leg"><div class="leg-dot" style="background:#16a34a"></div>#1–3</div>
      <div class="leg"><div class="leg-dot" style="background:#f59e0b"></div>#4–5</div>
      <div class="leg"><div class="leg-dot" style="background:#f97316"></div>#6–10</div>
      <div class="leg"><div class="leg-dot" style="background:#cda158"></div>#11+</div>
    </div>
  </div>
</div>`;
}

async function generateReportForClient(client) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !ANTHROPIC_API_KEY) {
    throw new Error(
      "Missing required env vars (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY). Check they're set in Vercel (for the on-demand button) or GitHub Actions secrets (for the batch job)."
    );
  }
  const { keywords, ai, local } = await getClientReportData(client);
  const label = monthLabel();
  const code = monthCode();

  // Organic rankings drive the report's main tables; maps rankings are
  // stored per keyword too (ranking_type='maps') but the report focuses on
  // organic, matching the historical report format.
  const mappedKeywords = keywords.filter((k) => k.ranking_type === "organic");
  const bestPosition = mappedKeywords.filter((k) => k.position > 0).sort((a, b) => a.position - b.position)[0];
  const mentionedCount = ai.filter((a) => a.mentioned).length;
  const aiScore = ai.length ? Math.round((mentionedCount / ai.length) * 100) : null;
  const avgArp = local.length
    ? (local.reduce((s, l) => s + (Number(l.arp) || 0), 0) / local.filter((l) => l.arp != null).length).toFixed(2)
    : null;

  const rating = await fetchGoogleRating(client);
  const { prevMap, prevLabel } = await snapshotAndGetPrevious(client, mappedKeywords, code);
  const currLabel = new Date().toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });

  // --- Claude-written narrative sections ---
  const execPrompt = `You write the Executive Summary insight box for a monthly SEO report
for a physical therapy / wellness clinic client, sent by an agency (Rehab CEOs)
to the clinic owner. Tone: confident, plain-spoken, factual, no hype, no em dashes.
Clinic: ${client.clinic_name}.
Keyword rankings: ${JSON.stringify(mappedKeywords.map((k) => ({ keyword: k.keyword, position: k.position, change: k.position_change })))}
AI visibility: ${JSON.stringify(ai.map((a) => ({ engine: a.engine, mentioned: a.mentioned })))}
Local pack: ${JSON.stringify(local.map((l) => ({ location: l.location_label, arp: l.arp, solv: l.solv })))}
Write 3-5 sentences a client would actually want to read: what's working, in specific
numbers, and what the team is focused on next. Plain text only, no markdown.`;
  const execSummary = await askClaude(execPrompt, 300);

  // Per-market insight (grouped by the sheet's location label, or a single
  // group if the client only has one location)
  const distinctLocations = [...new Set(mappedKeywords.map((k) => k.location_label || "_main"))];
  const marketBlocksHtml = [];
  for (const locKey of distinctLocations) {
    const groupKeywords =
      locKey === "_main" ? mappedKeywords : mappedKeywords.filter((k) => (k.location_label || "_main") === locKey);
    if (!groupKeywords.length) continue;
    const regionLabel = locKey === "_main" ? client.clinic_name.split(" ")[0] : locKey;
    const marketPrompt = `Write a 2-3 sentence client-facing insight for the "${regionLabel}" market
of ${client.clinic_name}'s SEO report. Rankings: ${JSON.stringify(
      groupKeywords.map((k) => ({ keyword: k.keyword, position: k.position, change: k.position_change }))
    )}. Confident, factual, no hype, no em dashes, plain text only.`;
    const insightText = await askClaude(marketPrompt, 200);
    marketBlocksHtml.push(renderMarketBlock(regionLabel, groupKeywords, esc(insightText), prevMap, prevLabel, currLabel));
  }

  let aiNarrative = "";
  if (ai.length) {
    const aiPrompt = `Write a 2-3 sentence AI-visibility narrative for ${client.clinic_name}'s
monthly SEO report. Data: ${JSON.stringify(
      ai.map((a) => ({ engine: a.engine, mentioned: a.mentioned, prompt: a.prompt }))
    )}. Confident, factual, no hype, no em dashes, plain text only.`;
    aiNarrative = await askClaude(aiPrompt, 200);
  }

  // --- Assemble KPI grid (Executive Summary) ---
  const rankedPositions = mappedKeywords.filter((k) => k.position > 0).map((k) => k.position);
  const positionRange =
    rankedPositions.length
      ? rankedPositions.length === 1
        ? `#${rankedPositions[0]}`
        : `#${Math.min(...rankedPositions)}-${Math.max(...rankedPositions)}`
      : "—";

  const kpis = [
    {
      label: "Best Organic Position",
      value: bestPosition ? `#${bestPosition.position}` : "—",
      sub: bestPosition ? bestPosition.keyword : "No ranking data yet",
      cls: bestPosition && bestPosition.position <= 5 ? "g" : "gold",
    },
    {
      label: "Month-End Positions",
      value: positionRange,
      sub: `All tracked keywords, ${label}`,
      cls: rankedPositions.length && Math.max(...rankedPositions) <= 10 ? "g" : "gold",
    },
    {
      label: "Local Pack ARP",
      value: avgArp ?? "—",
      sub: local.length ? `${local.length} location(s) tracked` : "Not mapped yet",
      cls: avgArp && avgArp <= 3 ? "g" : "gold",
    },
    {
      label: "AI Visibility Score",
      value: aiScore === null ? "—" : `${aiScore}%`,
      sub: ai.length ? `${mentionedCount} of ${ai.length} engines` : "Not tracked",
      cls: aiScore !== null && aiScore >= 50 ? "g" : "gold",
    },
  ];
  if (rating?.rating) {
    kpis.push({ label: "Google Rating", value: rating.rating, sub: `${rating.reviews || "—"} reviews`, cls: "g" });
  }
  kpis.push({ label: "Tracked Keywords", value: mappedKeywords.length, sub: `${label} tracking` });

  const aiSection = ai.length
    ? `<div class="ai-eyebrow">Section 03</div>
<h2 class="ai-main-title">AI Visibility</h2>
<p class="ai-main-sub">${esc(label)} · ${ai.map((a) => a.engine).join(" & ")} · ${ai.length} prompt${
        ai.length > 1 ? "s" : ""
      } tracked</p>
<div class="ai-score-center">
  <div class="ai-score-lbl-top">Overall AI Visibility Score</div>
  <div class="ai-gauge-wrap">
    <svg viewBox="0 0 120 120" width="170" height="170" xmlns="http://www.w3.org/2000/svg">
      <circle cx="60" cy="60" r="54" fill="none" stroke="#e8e8e8" stroke-width="8"/>
      <circle cx="60" cy="60" r="54" fill="none" stroke="${aiScore >= 50 ? "#16a34a" : "#cda158"}" stroke-width="8" stroke-dasharray="${
        (aiScore / 100) * 339.3
      } 339.3" stroke-linecap="round" transform="rotate(-90 60 60)"/>
    </svg>
    <div class="ai-gauge-inner">
      <div class="ai-gauge-num ${aiScore >= 50 ? "green" : "gold"}">${aiScore}%</div>
      <div class="ai-gauge-grade ${aiScore >= 50 ? "green" : "gold"}">${mentionedCount} of ${ai.length} mentioned</div>
    </div>
  </div>
</div>
<div class="ai-llm-grid">
${ai
  .map(
    (a) => `  <div class="ai-llm-card">
    <div class="ai-llm-card-name ${a.mentioned ? "green" : "gold"}">${esc(a.engine)}</div>
    <div class="ai-llm-card-pct ${a.mentioned ? "green" : "gold"}">${a.mentioned ? "Mentioned" : "0%"}</div>
    <div class="ai-llm-card-pos">${a.mentioned ? "Mentioned in tracked prompt" : "Not mentioned in tracked prompt"}</div>
  </div>`
  )
  .join("\n")}
</div>
${
  ai[0]?.prompt
    ? `<div class="ai-qb-lbl">Query Breakdown — ${esc(label)}</div>
<div class="ai-qb-block">
  <div class="ai-qb-top"><span class="ai-qb-prompt">"${esc(ai[0].prompt)}"</span></div>
  ${ai
    .map(
      (a) => `<div class="ai-qb-row"><span class="ai-qb-dot ${a.mentioned ? "mentioned" : "not-mentioned"}"></span><span class="ai-qb-llm">${esc(
        a.engine
      )}</span><span class="ai-qb-pos ${a.mentioned ? "mentioned" : "dim"}">${
        a.mentioned ? "Mentioned in tracked prompt" : "Not Yet Ranking"
      }</span></div>`
    )
    .join("\n")}
</div>`
    : ""
}
<div class="ai-narrative"><p>${esc(aiNarrative)}</p></div>
<div class="divider">· · ·</div>`
    : "";

  const localPackSection = local.length
    ? `<div class="sh"><div class="sh-left"><span class="sh-num">04</span><span class="sh-title">Local Pack Rankings</span></div><span class="sh-badge">Local Falcon</span></div>
${local.map(renderLocalPackCard).join("\n")}`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SEO Report — ${esc(client.clinic_name)} — ${esc(label)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}html{background:#e8e8e8}
body{font-family:'Manrope',system-ui,sans-serif;background:#f0f0f0;color:#111;font-size:14px;line-height:1.6}
.cover{background:#000;padding:52px 44px;display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;overflow:hidden}
.cover-tl{position:absolute;top:32px;left:32px;width:40px;height:40px;border-top:2px solid #cda158;border-left:2px solid #cda158;opacity:.9}
.cover-tr{position:absolute;top:32px;right:32px;width:40px;height:40px;border-top:2px solid #cda158;border-right:2px solid #cda158;opacity:.9}
.cover-bl{position:absolute;bottom:32px;left:32px;width:40px;height:40px;border-bottom:2px solid #cda158;border-left:2px solid #cda158;opacity:.9}
.cover-br{position:absolute;bottom:32px;right:32px;width:40px;height:40px;border-bottom:2px solid #cda158;border-right:2px solid #cda158;opacity:.9}
.cover-brand{display:flex;align-items:center;gap:16px;margin-bottom:16px;z-index:1}
.brand-line{width:44px;height:1px;background:linear-gradient(90deg,transparent,#cda158)}
.brand-line.r{background:linear-gradient(90deg,#cda158,transparent)}
.brand-text{font-size:11px;letter-spacing:.28em;font-weight:700;color:#cda158;text-transform:uppercase}
.cover-eyebrow{font-size:11px;letter-spacing:.22em;color:rgba(255,255,255,.35);text-transform:uppercase;margin-bottom:16px;z-index:1}
.cover-title{font-size:44px;font-weight:900;color:#fff;letter-spacing:-.03em;line-height:1;text-align:center;margin-bottom:12px;z-index:1}
.cover-domain{font-size:11px;letter-spacing:.22em;color:#cda158;font-weight:600;text-transform:uppercase;margin-bottom:28px;z-index:1}
.cover-badges{display:flex;gap:12px;z-index:1}
.cbadge{padding:8px 24px;border:1.5px solid rgba(205,161,88,.6);border-radius:40px;font-size:12px;font-weight:700;color:#cda158;letter-spacing:.1em;background:transparent}
.page{max-width:900px;margin:0 auto;padding:64px 44px}
.sh{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:36px;padding-bottom:16px;border-bottom:2px solid #e0e0e0}
.sh-left{display:flex;align-items:baseline;gap:14px}
.sh-num{font-size:11px;color:#cda158;font-weight:800;letter-spacing:.16em;text-transform:uppercase}
.sh-title{font-size:28px;font-weight:900;color:#000;letter-spacing:-.03em}
.sh-badge{font-size:10px;letter-spacing:.12em;font-weight:700;color:#888;border:1px solid #ddd;border-radius:20px;padding:5px 14px;text-transform:uppercase;white-space:nowrap}
.divider{text-align:center;margin:56px 0;color:#cda158;font-size:7px;letter-spacing:14px;opacity:.6}
.kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid #ddd;border-radius:12px;overflow:hidden;background:#fff;box-shadow:0 2px 12px rgba(0,0,0,.06);margin-bottom:28px}
.kpi{padding:26px 24px;border-right:1px solid #eee;border-bottom:1px solid #eee;background:#fff}
.kpi:nth-child(3n){border-right:none}.kpi:nth-child(n+4){border-bottom:none}
.kpi-lbl{font-size:10px;letter-spacing:.15em;font-weight:700;color:#999;text-transform:uppercase;margin-bottom:10px}
.kpi-val{font-size:48px;font-weight:900;color:#000;line-height:1;letter-spacing:-.03em}
.kpi-val.g{color:#16a34a}.kpi-val.gold{color:#cda158}
.kpi-sub{font-size:12px;color:#aaa;margin-top:8px;font-weight:500}
.hi-card{background:#fff;border:1px solid #e8e8e8;border-radius:12px;padding:22px 24px;margin-bottom:28px;box-shadow:0 1px 8px rgba(0,0,0,.04)}
.hi-label{display:flex;align-items:center;gap:8px;font-size:10px;letter-spacing:.15em;font-weight:800;text-transform:uppercase;margin-bottom:12px}
.hi-label.green{color:#16a34a}.hi-label.gold{color:#cda158}
.hi-card p{font-size:13.5px;color:#333;line-height:1.75}.hi-card p strong{color:#000}
.market-block{margin-bottom:48px}
.mkt-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}
.mkt-name{font-size:30px;font-weight:900;color:#000;letter-spacing:-.03em}
.mkt-badge{font-size:10px;letter-spacing:.1em;font-weight:700;border:1.5px solid currentColor;border-radius:20px;padding:5px 14px;white-space:nowrap}
.mkt-badge.top3{color:#16a34a}.mkt-badge.opp{color:#cda158}
.rtable{width:100%;border-collapse:collapse;border-radius:10px;overflow:hidden;border:1px solid #e8e8e8;background:#fff;box-shadow:0 1px 6px rgba(0,0,0,.04);font-size:13px}
.rtable thead tr{background:#000}
.rtable thead th{padding:12px 14px;font-size:10px;letter-spacing:.12em;font-weight:700;text-transform:uppercase;text-align:center;color:#cda158}
.rtable thead th:first-child{text-align:left;color:#fff}
.rtable tbody tr{border-bottom:1px solid #f2f2f2}.rtable tbody tr:last-child{border-bottom:none}
.rtable tbody td{padding:11px 14px;color:#333;font-weight:500;text-align:center}
.rtable tbody td:first-child{text-align:left;font-weight:600;font-size:12.5px;color:#111}
.rtable tbody td.p1{color:#16a34a;font-weight:800}.rtable tbody td.p2{color:#16a34a;font-weight:700}.rtable tbody td.p3{color:#16a34a;font-weight:700}
.rtable tbody td.pw{color:#cda158;font-weight:600}.rtable tbody td.pnr{color:#bbb;font-weight:500;font-size:12px}
.rtable tbody td.tup{color:#16a34a;font-weight:700}.rtable tbody td.tdn{color:#cda158;font-weight:700}.rtable tbody td.tfl{color:#bbb;font-weight:500}
.insight{background:#fffcf5;border:1px solid rgba(205,161,88,.35);border-radius:10px;padding:20px 22px;margin-top:20px}
.insight-lbl{display:flex;align-items:center;gap:8px;font-size:10px;letter-spacing:.14em;font-weight:800;color:#cda158;text-transform:uppercase;margin-bottom:10px}
.insight p{font-size:13.5px;color:#444;line-height:1.75}.insight p strong{color:#111}
.ai-eyebrow{font-size:10px;letter-spacing:.2em;font-weight:800;color:#cda158;text-transform:uppercase;margin-bottom:8px}
.ai-main-title{font-size:40px;font-weight:900;color:#000;letter-spacing:-.03em;margin-bottom:8px}
.ai-main-sub{font-size:13px;color:#999;margin-bottom:40px;font-weight:500}
.ai-score-center{text-align:center;margin-bottom:36px}
.ai-score-lbl-top{font-size:9px;letter-spacing:.2em;font-weight:800;color:#999;text-transform:uppercase;margin-bottom:20px}
.ai-gauge-wrap{position:relative;display:inline-block}
.ai-gauge-inner{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;pointer-events:none}
.ai-gauge-num{font-size:44px;font-weight:900;color:#cda158;letter-spacing:-.04em;line-height:1}
.ai-gauge-num.green{color:#16a34a}.ai-gauge-num.gold{color:#cda158}
.ai-gauge-grade{font-size:10px;letter-spacing:.14em;font-weight:800;color:#cda158;text-transform:uppercase;margin-top:3px}
.ai-gauge-grade.green{color:#16a34a}.ai-gauge-grade.gold{color:#cda158}
.ai-llm-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:40px}
.ai-llm-card{border:1px solid #e8e8e8;border-radius:12px;padding:24px 28px;background:#fff;box-shadow:0 1px 8px rgba(0,0,0,.04)}
.ai-llm-card-name{font-size:10px;letter-spacing:.18em;font-weight:800;color:#cda158;text-transform:uppercase;margin-bottom:16px}
.ai-llm-card-name.green{color:#16a34a}.ai-llm-card-name.gold{color:#cda158}
.ai-llm-card-pct{font-size:52px;font-weight:900;color:#cda158;letter-spacing:-.04em;line-height:1;margin-bottom:12px}
.ai-llm-card-pct.green{color:#16a34a}.ai-llm-card-pct.gold{color:#cda158}
.ai-llm-card-pos{font-size:13px;color:#555;margin-bottom:6px;font-weight:500}
.ai-qb-lbl{font-size:9px;letter-spacing:.18em;font-weight:800;color:#aaa;text-transform:uppercase;margin-bottom:14px}
.ai-qb-block{border:1px solid #e8e8e8;border-radius:10px;overflow:hidden;margin-bottom:10px;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.03)}
.ai-qb-top{display:flex;align-items:center;justify-content:space-between;padding:14px 20px;background:#fafafa;border-bottom:1px solid #f0f0f0;gap:16px}
.ai-qb-prompt{font-size:13px;font-weight:600;color:#111;font-style:italic;flex:1}
.ai-qb-row{display:flex;align-items:center;padding:12px 20px;border-top:1px solid #f5f5f5;gap:12px}
.ai-qb-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.ai-qb-dot.mentioned{background:#16a34a}.ai-qb-dot.not-mentioned{background:#ddd}
.ai-qb-llm{font-size:13.5px;font-weight:700;color:#111;flex:1}
.ai-qb-pos{font-size:14px;font-weight:800}
.ai-qb-pos.dim{color:#bbb;font-weight:500;font-size:13px}.ai-qb-pos.mentioned{color:#16a34a}
.ai-narrative{background:#111;border-radius:12px;padding:28px 32px;margin-top:28px}
.ai-narrative p{font-size:14px;color:rgba(255,255,255,.75);line-height:1.85}.ai-narrative p strong{color:#fff}
.lp-card{margin-bottom:52px;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,.08);background:#fff}
.lp-hdr{background:#000;display:grid;grid-template-columns:1fr auto;align-items:stretch}
.lp-city{padding:20px 24px}.lp-city-name{font-size:24px;font-weight:900;color:#fff;letter-spacing:-.02em}
.lp-city-sub{font-size:10px;letter-spacing:.18em;font-weight:600;color:rgba(255,255,255,.35);text-transform:uppercase;margin-top:3px}
.lp-stat{padding:20px 24px;border-left:1px solid rgba(255,255,255,.08);text-align:center;display:flex;flex-direction:column;justify-content:center}
.lp-stat-lbl{font-size:9px;letter-spacing:.15em;font-weight:700;color:rgba(255,255,255,.35);text-transform:uppercase;margin-bottom:5px}
.lp-stat-val{font-size:26px;font-weight:900;letter-spacing:-.02em}
.lp-stat-val.good{color:#16a34a}.lp-stat-val.opp{color:#cda158}
.map-wrap{overflow:hidden;border-top:1px solid #e8e8e8;background:#f5f5f5;padding:16px}
.lp-heatmap{width:85%;display:block;border:none;margin:0 auto;border-radius:6px;box-shadow:0 2px 10px rgba(0,0,0,.12)}
.lp-foot{padding:14px 22px;display:flex;align-items:center;justify-content:space-between;border-top:1px solid #efefef}
.lp-kw{font-size:11px;color:#888;font-weight:600}.lp-kw span{color:#111;font-weight:700}
.legend{display:flex;gap:18px}.leg{display:flex;align-items:center;gap:6px;font-size:11px;color:#777}
.leg-dot{width:11px;height:11px;border-radius:50%;flex-shrink:0}
.report-footer{margin-top:64px;padding:24px 0;border-top:1px solid #ddd;display:flex;justify-content:space-between;align-items:center}
.ft-brand{font-size:13px;font-weight:700;color:#333}.ft-brand span{color:#cda158;border-bottom:1px solid #cda158;padding-bottom:1px}
@media print{*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}@page{margin:.5in}html,body{background:#f0f0f0!important}.cover{background:#000!important}.page{padding:0;zoom:.72}.market-block,.kpi-grid,.hi-card,.lp-card{page-break-inside:avoid}.sh{page-break-after:avoid}.divider{margin:28px 0;page-break-after:avoid}}
</style>
</head>
<body>
<div class="cover">
  <div class="cover-tl"></div><div class="cover-tr"></div><div class="cover-bl"></div><div class="cover-br"></div>
  <div class="cover-brand"><div class="brand-line"></div><div class="brand-text">Rehab CEOs</div><div class="brand-line r"></div></div>
  <div class="cover-eyebrow">Monthly SEO Performance Report</div>
  <div class="cover-title">${esc(client.clinic_name)}</div>
  <div class="cover-domain">${esc(client.domain)}</div>
  <div class="cover-badges"><div class="cbadge">${esc(label)}</div></div>
</div>
<div class="page">

<div class="sh"><div class="sh-left"><span class="sh-num">01</span><span class="sh-title">Executive Summary</span></div><span class="sh-badge">${esc(
    label
  )}</span></div>
<p style="font-size:10px;letter-spacing:.16em;font-weight:800;color:#bbb;text-transform:uppercase;margin-bottom:18px">Performance Snapshot · ${esc(
    label
  )}</p>
<div class="kpi-grid">
${renderKpiGrid(kpis)}
</div>
<div class="hi-card">
  <div class="hi-label ${bestPosition && bestPosition.position <= 5 ? "green" : "gold"}"><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="#cda158" stroke-width="1.5"/><path d="M8 5v4M8 11v.5" stroke="#cda158" stroke-width="1.5" stroke-linecap="round"/></svg> ${esc(
    label
  )} Summary</div>
  <p>${esc(execSummary)}</p>
</div>
<div class="divider">· · ·</div>
<div class="sh"><div class="sh-left"><span class="sh-num">02</span><span class="sh-title">Keyword Rankings</span></div><span class="sh-badge">Daily Tracking</span></div>
${marketBlocksHtml.join("\n")}
<div class="divider">· · ·</div>
${aiSection}
${localPackSection}
<div class="report-footer"><div class="ft-brand">Powered by <span>Rehab CEOs</span></div></div>

</div>
</body>
</html>`;

  // Upload to Supabase Storage
  const storagePath = `${client.slug}/${code}.html`;
  const { error: uploadError } = await supabase.storage
    .from("report")
    .upload(storagePath, html, { contentType: "text/html", upsert: true });
  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage.from("report").getPublicUrl(storagePath);

  const { error: dbError } = await supabase.from("monthly_reports").upsert(
    {
      client_slug: client.slug,
      report_month: code,
      report_label: label,
      storage_path: storagePath,
      public_url: urlData.publicUrl,
      generated_at: new Date().toISOString(),
    },
    { onConflict: "client_slug,report_month" }
  );
  if (dbError) throw dbError;

  return { html, publicUrl: urlData.publicUrl };
}

export { generateReportForClient };

async function main() {
  const targetSlug = process.argv[2];
  const targets = targetSlug ? clientsData.filter((c) => c.slug === targetSlug) : clientsData;

  if (targetSlug && targets.length === 0) {
    console.error(`No client found with slug "${targetSlug}"`);
    process.exit(1);
  }

  let ok = 0;
  let fail = 0;
  for (const client of targets) {
    try {
      const { publicUrl } = await generateReportForClient(client);
      console.log(`[ok] ${client.clinic_name}: ${publicUrl}`);
      ok++;
    } catch (err) {
      console.error(`[fail] ${client.clinic_name}:`, err.message);
      fail++;
    }
    await new Promise((r) => setTimeout(r, 400)); // pace Claude API + Supabase calls
  }
  console.log(`Done. ${ok} succeeded, ${fail} failed.`);
}

// Only run as a CLI batch job when executed directly (`node generate-report.mjs`),
// not when imported by the Vercel API route for a single on-demand report.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
