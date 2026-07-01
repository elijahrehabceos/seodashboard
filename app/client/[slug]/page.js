import Link from "next/link";
import { supabase } from "@/lib/supabase";
import ClientChat from "./ClientChat";

export const revalidate = 3600;

async function getClientData(slug) {
  const [{ data: client }, { data: keywords }, { data: ai }, { data: local }, { data: insight }] =
    await Promise.all([
      supabase.from("clients").select("*").eq("slug", slug).single(),
      supabase
        .from("keyword_rankings")
        .select("*")
        .eq("client_slug", slug)
        .order("position", { ascending: true }),
      supabase.from("ai_visibility").select("*").eq("client_slug", slug),
      supabase.from("local_pack").select("*").eq("client_slug", slug),
      supabase.from("client_insights").select("*").eq("client_slug", slug).maybeSingle(),
    ]);

  return {
    client,
    keywords: keywords || [],
    ai: ai || [],
    local: local || [],
    insight,
  };
}

function posClass(position) {
  if (!position || position <= 0) return "pnr";
  if (position === 1) return "p1";
  if (position === 2) return "p2";
  if (position === 3) return "p3";
  return "pw";
}

function trendClass(change) {
  if (!change) return "tfl";
  return change > 0 ? "tup" : "tdn";
}

function trendLabel(change) {
  if (!change) return "— flat";
  return change > 0 ? `▲ +${change}` : `▼ ${change}`;
}

export default async function ClientPage({ params }) {
  const { client, keywords, ai, local, insight } = await getClientData(params.slug);

  if (!client) {
    return (
      <main style={{ maxWidth: 640, margin: "0 auto", padding: "64px 24px", fontFamily: "Manrope, sans-serif" }}>
        <p style={{ color: "#888" }}>
          No data for this client yet.{" "}
          <Link href="/" style={{ color: "#cda158" }}>
            Back to dashboard
          </Link>
        </p>
      </main>
    );
  }

  const bestPosition = keywords
    .filter((k) => k.position && k.position > 0)
    .sort((a, b) => a.position - b.position)[0];

  const mentionedCount = ai.filter((a) => a.mentioned).length;
  const aiScore = ai.length ? Math.round((mentionedCount / ai.length) * 100) : null;
  const aiIsGood = aiScore !== null && aiScore >= 50;

  const arpValues = local.map((l) => l.arp).filter((v) => v != null);
  const avgArp = arpValues.length
    ? (arpValues.reduce((a, b) => a + b, 0) / arpValues.length).toFixed(2)
    : null;
  const solvValues = local.map((l) => l.solv).filter((v) => v != null);
  const avgSolv = solvValues.length
    ? Math.round(solvValues.reduce((a, b) => a + b, 0) / solvValues.length)
    : null;
  const arpIsGood = avgArp !== null && avgArp <= 3;

  return (
    <>
      <style>{`
        .rd-body{font-family:'Manrope',system-ui,sans-serif;background:#f0f0f0;color:#111;font-size:14px;line-height:1.6}
        .rd-cover{background:#000;padding:52px 44px;display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;overflow:hidden}
        .rd-cover-tl{position:absolute;top:32px;left:32px;width:40px;height:40px;border-top:2px solid #cda158;border-left:2px solid #cda158;opacity:.9}
        .rd-cover-tr{position:absolute;top:32px;right:32px;width:40px;height:40px;border-top:2px solid #cda158;border-right:2px solid #cda158;opacity:.9}
        .rd-cover-bl{position:absolute;bottom:32px;left:32px;width:40px;height:40px;border-bottom:2px solid #cda158;border-left:2px solid #cda158;opacity:.9}
        .rd-cover-br{position:absolute;bottom:32px;right:32px;width:40px;height:40px;border-bottom:2px solid #cda158;border-right:2px solid #cda158;opacity:.9}
        .rd-cover-brand{display:flex;align-items:center;gap:16px;margin-bottom:16px;z-index:1}
        .rd-brand-line{width:44px;height:1px;background:linear-gradient(90deg,transparent,#cda158)}
        .rd-brand-line.r{background:linear-gradient(90deg,#cda158,transparent)}
        .rd-brand-text{font-size:11px;letter-spacing:.28em;font-weight:700;color:#cda158;text-transform:uppercase}
        .rd-cover-eyebrow{font-size:11px;letter-spacing:.22em;color:rgba(255,255,255,.35);text-transform:uppercase;margin-bottom:16px;z-index:1}
        .rd-cover-title{font-size:44px;font-weight:900;color:#fff;letter-spacing:-.03em;line-height:1;text-align:center;margin-bottom:12px;z-index:1}
        .rd-cover-domain{font-size:11px;letter-spacing:.22em;color:#cda158;font-weight:600;text-transform:uppercase;margin-bottom:28px;z-index:1}
        .rd-cover-badges{display:flex;gap:12px;z-index:1}
        .rd-cbadge{padding:8px 24px;border:1.5px solid rgba(205,161,88,.6);border-radius:40px;font-size:12px;font-weight:700;color:#cda158;letter-spacing:.1em;background:transparent}
        .rd-page{max-width:900px;margin:0 auto;padding:64px 44px}
        .rd-sh{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:36px;padding-bottom:16px;border-bottom:2px solid #e0e0e0}
        .rd-sh-left{display:flex;align-items:baseline;gap:14px}
        .rd-sh-num{font-size:11px;color:#cda158;font-weight:800;letter-spacing:.16em;text-transform:uppercase}
        .rd-sh-title{font-size:28px;font-weight:900;color:#000;letter-spacing:-.03em}
        .rd-sh-badge{font-size:10px;letter-spacing:.12em;font-weight:700;color:#888;border:1px solid #ddd;border-radius:20px;padding:5px 14px;text-transform:uppercase;white-space:nowrap}
        .rd-divider{text-align:center;margin:56px 0;color:#cda158;font-size:7px;letter-spacing:14px;opacity:.6}
        .rd-kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid #ddd;border-radius:12px;overflow:hidden;background:#fff;box-shadow:0 2px 12px rgba(0,0,0,.06);margin-bottom:28px}
        .rd-kpi{padding:26px 24px;border-right:1px solid #eee;border-bottom:1px solid #eee;background:#fff}
        .rd-kpi:nth-child(3n){border-right:none}
        .rd-kpi-lbl{font-size:10px;letter-spacing:.15em;font-weight:700;color:#999;text-transform:uppercase;margin-bottom:10px}
        .rd-kpi-val{font-size:40px;font-weight:900;color:#000;line-height:1;letter-spacing:-.03em}
        .rd-kpi-val.g{color:#16a34a}.rd-kpi-val.gold{color:#cda158}
        .rd-kpi-sub{font-size:12px;color:#aaa;margin-top:8px;font-weight:500}
        .rd-hi-card{background:#fff;border:1px solid #e8e8e8;border-radius:12px;padding:22px 24px;margin-bottom:28px;box-shadow:0 1px 8px rgba(0,0,0,.04)}
        .rd-hi-label{display:flex;align-items:center;gap:8px;font-size:10px;letter-spacing:.15em;font-weight:800;text-transform:uppercase;margin-bottom:12px}
        .rd-hi-label.green{color:#16a34a}.rd-hi-label.gold{color:#cda158}
        .rd-hi-card p{font-size:13.5px;color:#333;line-height:1.75}
        .rd-rtable{width:100%;border-collapse:collapse;border-radius:10px;overflow:hidden;border:1px solid #e8e8e8;background:#fff;box-shadow:0 1px 6px rgba(0,0,0,.04);font-size:13px}
        .rd-rtable thead tr{background:#000}
        .rd-rtable thead th{padding:12px 14px;font-size:10px;letter-spacing:.12em;font-weight:700;text-transform:uppercase;text-align:center;color:#cda158}
        .rd-rtable thead th:first-child{text-align:left;color:#fff}
        .rd-rtable tbody tr{border-bottom:1px solid #f2f2f2}.rd-rtable tbody tr:last-child{border-bottom:none}
        .rd-rtable tbody td{padding:11px 14px;color:#333;font-weight:500;text-align:center}
        .rd-rtable tbody td:first-child{text-align:left;font-weight:600;font-size:12.5px;color:#111}
        .rd-rtable tbody td.p1{color:#16a34a;font-weight:800}.rd-rtable tbody td.p2{color:#16a34a;font-weight:700}.rd-rtable tbody td.p3{color:#16a34a;font-weight:700}
        .rd-rtable tbody td.pw{color:#cda158;font-weight:600}.rd-rtable tbody td.pnr{color:#bbb;font-weight:500;font-size:12px}
        .rd-rtable tbody td.tup{color:#16a34a;font-weight:700}.rd-rtable tbody td.tdn{color:#cda158;font-weight:700}.rd-rtable tbody td.tfl{color:#bbb;font-weight:500}
        .rd-ai-eyebrow{font-size:10px;letter-spacing:.2em;font-weight:800;color:#cda158;text-transform:uppercase;margin-bottom:8px}
        .rd-ai-main-title{font-size:36px;font-weight:900;color:#000;letter-spacing:-.03em;margin-bottom:8px}
        .rd-ai-main-sub{font-size:13px;color:#999;margin-bottom:36px;font-weight:500}
        .rd-ai-score-center{text-align:center;margin-bottom:36px}
        .rd-ai-score-lbl-top{font-size:9px;letter-spacing:.2em;font-weight:800;color:#999;text-transform:uppercase;margin-bottom:20px}
        .rd-ai-gauge-wrap{position:relative;display:inline-block}
        .rd-ai-gauge-inner{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;pointer-events:none}
        .rd-ai-gauge-num{font-size:40px;font-weight:900;letter-spacing:-.04em;line-height:1}
        .rd-ai-gauge-num.green{color:#16a34a}.rd-ai-gauge-num.gold{color:#cda158}
        .rd-ai-gauge-grade{font-size:10px;letter-spacing:.14em;font-weight:800;text-transform:uppercase;margin-top:3px}
        .rd-ai-gauge-grade.green{color:#16a34a}.rd-ai-gauge-grade.gold{color:#cda158}
        .rd-ai-llm-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
        .rd-ai-llm-card{border:1px solid #e8e8e8;border-radius:12px;padding:24px 28px;background:#fff;box-shadow:0 1px 8px rgba(0,0,0,.04)}
        .rd-ai-llm-card-name{font-size:10px;letter-spacing:.18em;font-weight:800;text-transform:uppercase;margin-bottom:16px}
        .rd-ai-llm-card-name.green{color:#16a34a}.rd-ai-llm-card-name.gold{color:#cda158}
        .rd-ai-llm-card-pct{font-size:44px;font-weight:900;letter-spacing:-.04em;line-height:1;margin-bottom:12px}
        .rd-ai-llm-card-pct.green{color:#16a34a}.rd-ai-llm-card-pct.gold{color:#cda158}
        .rd-ai-llm-card-pos{font-size:13px;color:#555;font-weight:500}
        .rd-lp-card{margin-bottom:36px;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,.08);background:#fff}
        .rd-lp-hdr{background:#000;display:grid;grid-template-columns:1fr auto;align-items:stretch}
        .rd-lp-city{padding:20px 24px}.rd-lp-city-name{font-size:22px;font-weight:900;color:#fff;letter-spacing:-.02em}
        .rd-lp-city-sub{font-size:10px;letter-spacing:.18em;font-weight:600;color:rgba(255,255,255,.35);text-transform:uppercase;margin-top:3px}
        .rd-lp-stat{padding:20px 24px;border-left:1px solid rgba(255,255,255,.08);text-align:center;display:flex;flex-direction:column;justify-content:center}
        .rd-lp-stat-lbl{font-size:9px;letter-spacing:.15em;font-weight:700;color:rgba(255,255,255,.35);text-transform:uppercase;margin-bottom:5px}
        .rd-lp-stat-val{font-size:24px;font-weight:900;letter-spacing:-.02em}
        .rd-lp-stat-val.good{color:#16a34a}.rd-lp-stat-val.opp{color:#cda158}
        .rd-map-wrap{overflow:hidden;border-top:1px solid #e8e8e8;background:#f5f5f5;padding:16px;text-align:center}
        .rd-lp-heatmap{width:85%;display:block;border:none;margin:0 auto;border-radius:6px;box-shadow:0 2px 10px rgba(0,0,0,.12)}
        .rd-lp-heatmap-missing{padding:32px;color:#999;font-size:12.5px}
        .rd-lp-foot{padding:14px 22px;display:flex;align-items:center;justify-content:space-between;border-top:1px solid #efefef;flex-wrap:wrap;gap:8px}
        .rd-lp-kw{font-size:11px;color:#888;font-weight:600}.rd-lp-kw span{color:#111;font-weight:700}
        .rd-report-footer{margin-top:64px;padding:24px 0;border-top:1px solid #ddd;display:flex;justify-content:space-between;align-items:center}
        .rd-ft-brand{font-size:13px;font-weight:700;color:#333}.rd-ft-brand span{color:#cda158;border-bottom:1px solid #cda158;padding-bottom:1px}
        .rd-back-link{display:inline-block;margin:20px 0 0 44px;font-size:12px;color:#888;text-decoration:none}
      `}</style>

      <div className="rd-body">
        <a href="/" className="rd-back-link">← All clients</a>

        <div className="rd-cover">
          <div className="rd-cover-tl"></div><div className="rd-cover-tr"></div><div className="rd-cover-bl"></div><div className="rd-cover-br"></div>
          <div className="rd-cover-brand"><div className="rd-brand-line"></div><div className="rd-brand-text">Rehab CEOs</div><div className="rd-brand-line r"></div></div>
          <div className="rd-cover-eyebrow">Live SEO Dashboard</div>
          <div className="rd-cover-title">{client.clinic_name}</div>
          <div className="rd-cover-domain">{client.domain}</div>
          <div className="rd-cover-badges"><div className="rd-cbadge">{client.owner_name}</div></div>
        </div>

        <div className="rd-page">
          <div className="rd-sh"><div className="rd-sh-left"><span className="rd-sh-num">01</span><span className="rd-sh-title">Executive Summary</span></div><span className="rd-sh-badge">Live</span></div>

          <div className="rd-kpi-grid">
            <div className="rd-kpi">
              <div className="rd-kpi-lbl">Best Organic Position</div>
              <div className={`rd-kpi-val ${bestPosition ? "g" : ""}`}>{bestPosition ? `#${bestPosition.position}` : "—"}</div>
              <div className="rd-kpi-sub">{bestPosition ? bestPosition.keyword : "No ranking data yet"}</div>
            </div>
            <div className="rd-kpi">
              <div className="rd-kpi-lbl">Tracked Keywords</div>
              <div className="rd-kpi-val">{keywords.length}</div>
              <div className="rd-kpi-sub">Across all tracked markets</div>
            </div>
            <div className="rd-kpi">
              <div className="rd-kpi-lbl">AI Visibility Score</div>
              <div className={`rd-kpi-val ${aiScore === null ? "" : aiIsGood ? "g" : "gold"}`}>{aiScore === null ? "—" : `${aiScore}%`}</div>
              <div className="rd-kpi-sub">{ai.length ? `${mentionedCount} of ${ai.length} engines` : "Not tracked"}</div>
            </div>
            <div className="rd-kpi">
              <div className="rd-kpi-lbl">Local Pack ARP</div>
              <div className={`rd-kpi-val ${avgArp === null ? "" : arpIsGood ? "g" : "gold"}`}>{avgArp ?? "—"}</div>
              <div className="rd-kpi-sub">{local.length ? `${local.length} location${local.length > 1 ? "s" : ""} tracked` : "Not mapped yet"}</div>
            </div>
            <div className="rd-kpi">
              <div className="rd-kpi-lbl">Local Pack SoLV</div>
              <div className={`rd-kpi-val ${avgSolv === null ? "" : avgSolv >= 50 ? "g" : "gold"}`}>{avgSolv === null ? "—" : `${avgSolv}%`}</div>
              <div className="rd-kpi-sub">Share of local voice</div>
            </div>
          </div>

          {insight?.blurb && (
            <div className="rd-hi-card">
              <div className={`rd-hi-label ${aiIsGood || (bestPosition && bestPosition.position <= 3) ? "green" : "gold"}`}>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/><path d="M8 5v4M8 11v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                Latest Summary
              </div>
              <p>{insight.blurb}</p>
            </div>
          )}

          <div className="rd-divider">· · ·</div>

          <div className="rd-sh"><div className="rd-sh-left"><span className="rd-sh-num">02</span><span className="rd-sh-title">Keyword Rankings</span></div><span className="rd-sh-badge">Daily Tracking</span></div>
          {keywords.length === 0 ? (
            <p style={{ color: "#999", fontSize: 13 }}>No ranking data yet.</p>
          ) : (
            <table className="rd-rtable">
              <thead><tr><th>Keyword</th><th>Position</th><th>Trend</th></tr></thead>
              <tbody>
                {keywords.map((k) => (
                  <tr key={k.id}>
                    <td>{k.keyword}</td>
                    <td className={posClass(k.position)}>{k.position && k.position > 0 ? k.position : "NR"}</td>
                    <td className={trendClass(k.position_change)}>{trendLabel(k.position_change)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="rd-divider">· · ·</div>

          <div className="rd-ai-eyebrow">Section 03</div>
          <h2 className="rd-ai-main-title">AI Visibility</h2>
          <p className="rd-ai-main-sub">{ai.length ? `${ai.length} engine${ai.length > 1 ? "s" : ""} tracked` : "Not tracked yet"}</p>

          {ai.length === 0 ? (
            <p style={{ color: "#999", fontSize: 13 }}>AI tracking not set up for this client.</p>
          ) : (
            <>
              <div className="rd-ai-score-center">
                <div className="rd-ai-score-lbl-top">Overall AI Visibility Score</div>
                <div className="rd-ai-gauge-wrap">
                  <svg viewBox="0 0 120 120" width="150" height="150" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="60" cy="60" r="54" fill="none" stroke="#e8e8e8" strokeWidth="8"/>
                    <circle
                      cx="60" cy="60" r="54" fill="none"
                      stroke={aiIsGood ? "#16a34a" : "#cda158"}
                      strokeWidth="8"
                      strokeDasharray={`${(aiScore / 100) * 339.3} 339.3`}
                      strokeLinecap="round"
                      transform="rotate(-90 60 60)"
                    />
                  </svg>
                  <div className="rd-ai-gauge-inner">
                    <div className={`rd-ai-gauge-num ${aiIsGood ? "green" : "gold"}`}>{aiScore}%</div>
                    <div className={`rd-ai-gauge-grade ${aiIsGood ? "green" : "gold"}`}>{mentionedCount} of {ai.length} mentioned</div>
                  </div>
                </div>
              </div>
              <div className="rd-ai-llm-grid">
                {ai.map((a) => (
                  <div key={a.id} className="rd-ai-llm-card">
                    <div className={`rd-ai-llm-card-name ${a.mentioned ? "green" : "gold"}`}>{a.engine.replace(/_/g, " ")}</div>
                    <div className={`rd-ai-llm-card-pct ${a.mentioned ? "green" : "gold"}`}>{a.mentioned ? "Mentioned" : "0%"}</div>
                    <div className="rd-ai-llm-card-pos">{a.mentioned ? "Mentioned in tracked prompt" : "Not mentioned in tracked prompt"}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="rd-divider">· · ·</div>

          <div className="rd-sh"><div className="rd-sh-left"><span className="rd-sh-num">04</span><span className="rd-sh-title">Local Pack Rankings</span></div><span className="rd-sh-badge">Local Falcon</span></div>

          {local.length === 0 ? (
            <p style={{ color: "#999", fontSize: 13 }}>No Local Falcon data yet for this client.</p>
          ) : (
            local.map((l) => (
              <div key={l.id} className="rd-lp-card">
                <div className="rd-lp-hdr">
                  <div className="rd-lp-city">
                    <div className="rd-lp-city-name">{l.location_label}</div>
                    <div className="rd-lp-city-sub">{l.keyword}</div>
                  </div>
                  <div className="rd-lp-stat">
                    <div className="rd-lp-stat-lbl">Avg. Rank (ARP)</div>
                    <div className={`rd-lp-stat-val ${l.arp && l.arp <= 3 ? "good" : "opp"}`}>{l.arp ?? "—"}</div>
                  </div>
                </div>
                <div className="rd-map-wrap">
                  {l.heatmap_url ? (
                    <img className="rd-lp-heatmap" src={l.heatmap_url} alt={`Local Falcon heatmap — ${l.location_label}`} />
                  ) : (
                    <div className="rd-lp-heatmap-missing">Heatmap not available yet for this location.</div>
                  )}
                </div>
                <div className="rd-lp-foot">
                  <div className="rd-lp-kw">SoLV: <span>{l.solv != null ? `${l.solv}%` : "—"}</span></div>
                  <div className="rd-lp-kw">ATRP: <span>{l.atrp ?? "—"}</span></div>
                </div>
              </div>
            ))
          )}

          <div className="rd-report-footer"><div className="rd-ft-brand">Powered by <span>Rehab CEOs</span></div></div>

          <ClientChat slug={params.slug} />
        </div>
      </div>
    </>
  );
}
