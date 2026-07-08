import Link from "next/link";
import { supabase } from "@/lib/supabase";
import ClientChat from "./ClientChat";
import KeywordPositionChart from "./KeywordPositionChart";

export const revalidate = 3600;

async function getClientData(slug) {
  const [{ data: client }, { data: keywords }, { data: ai }, { data: insight }, { data: engines }] =
    await Promise.all([
      supabase.from("clients").select("*").eq("slug", slug).single(),
      supabase
        .from("keyword_rankings")
        .select("*")
        .eq("client_slug", slug)
        .order("position", { ascending: true }),
      supabase.from("ai_visibility").select("*").eq("client_slug", slug),
      supabase.from("client_insights").select("*").eq("client_slug", slug).maybeSingle(),
      supabase.from("search_engines").select("*").eq("client_slug", slug),
    ]);

  return {
    client,
    keywords: keywords || [],
    ai: ai || [],
    insight,
    engines: engines || [],
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
  const { client, keywords, ai, insight, engines } = await getClientData(params.slug);

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

  const regionByEngine = new Map(engines.map((e) => [e.site_engine_id, e.region_name]));
  const mappedKeywords = keywords.filter((k) => regionByEngine.get(k.site_engine_id) || engines.length === 0);
  const isMultiLocation = new Set(mappedKeywords.map((k) => k.site_engine_id)).size > 1;

  const bestPosition = mappedKeywords
    .filter((k) => k.position && k.position > 0)
    .sort((a, b) => a.position - b.position)[0];

  const goodKeywords = mappedKeywords
    .filter((k) => k.position && k.position > 0 && k.position <= 10)
    .sort((a, b) => a.position - b.position);
  const needsImprovement = mappedKeywords
    .filter((k) => !k.position || k.position <= 0 || k.position > 10)
    .sort((a, b) => (b.position || 999) - (a.position || 999));

  const mentionedCount = ai.filter((a) => a.mentioned).length;
  const aiScore = ai.length ? Math.round((mentionedCount / ai.length) * 100) : null;
  const aiIsGood = aiScore !== null && aiScore >= 50;

  return (
    <div className="rd-body">
      <div className="rd-cover">
        <div className="rd-cover-tl"></div><div className="rd-cover-tr"></div><div className="rd-cover-bl"></div><div className="rd-cover-br"></div>
        <div className="rd-cover-brand"><img src="/rehabceos-logo.webp" alt="Rehab CEOs" style={{ height: 30, width: "auto" }} /></div>
        <div className="rd-cover-eyebrow">Live SEO Dashboard</div>
        <div className="rd-cover-title">{client.clinic_name}</div>
        <div className="rd-cover-domain">{client.domain}</div>
        <div className="rd-cover-badges"><div className="rd-cbadge">{client.owner_name}</div></div>
      </div>

      <div className="rd-page">
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 24 }}>
          <a
            href={`/api/report/${params.slug}`}
            target="_blank"
            rel="noreferrer"
            style={{
              display: "inline-block",
              background: "#cda158",
              color: "#000",
              fontWeight: 700,
              fontSize: 13,
              padding: "10px 22px",
              borderRadius: 30,
              textDecoration: "none",
            }}
          >
            Generate Monthly Report
          </a>
        </div>
        <div className="rd-sh"><div className="rd-sh-left"><span className="rd-sh-num">01</span><span className="rd-sh-title">Executive Summary</span></div><span className="rd-sh-badge">Live</span></div>

        <div className="rd-kpi-grid">
          <div className="rd-kpi">
            <div className="rd-kpi-lbl">Best Organic Position</div>
            <div className={`rd-kpi-val ${bestPosition ? "g" : ""}`}>{bestPosition ? `#${bestPosition.position}` : "—"}</div>
            <div className="rd-kpi-sub">{bestPosition ? bestPosition.keyword : "No ranking data yet"}</div>
          </div>
          <div className="rd-kpi">
            <div className="rd-kpi-lbl">Tracked Keywords</div>
            <div className="rd-kpi-val">{mappedKeywords.length}</div>
            <div className="rd-kpi-sub">Across all tracked markets</div>
          </div>
          <div className="rd-kpi">
            <div className="rd-kpi-lbl">Keywords in Top 10</div>
            <div className={`rd-kpi-val ${goodKeywords.length ? "g" : "gold"}`}>{goodKeywords.length} of {mappedKeywords.length}</div>
            <div className="rd-kpi-sub">Page 1 visibility</div>
          </div>
          <div className="rd-kpi">
            <div className="rd-kpi-lbl">AI Visibility Score</div>
            <div className={`rd-kpi-val ${aiScore === null ? "" : aiIsGood ? "g" : "gold"}`}>{aiScore === null ? "—" : `${aiScore}%`}</div>
            <div className="rd-kpi-sub">{ai.length ? `${mentionedCount} of ${ai.length} engines` : "Not tracked"}</div>
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

        {mappedKeywords.length > 0 && (
          <>
            <div className="rd-sh"><div className="rd-sh-left"><span className="rd-sh-num">Chart</span><span className="rd-sh-title">Ranking Overview</span></div><span className="rd-sh-badge">Top 12</span></div>
            <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 12, padding: "20px 24px", marginBottom: 48 }}>
              <KeywordPositionChart keywords={mappedKeywords} />
            </div>
          </>
        )}

        <div className="rd-sh"><div className="rd-sh-left"><span className="rd-sh-num">02</span><span className="rd-sh-title">Good Keywords</span></div><span className="rd-sh-badge">Page 1</span></div>
        {goodKeywords.length === 0 ? (
          <p style={{ color: "#999", fontSize: 13, marginBottom: 40 }}>No keywords ranking in the top 10 yet.</p>
        ) : (
          <table className="rd-rtable" style={{ marginBottom: 48 }}>
            <thead>
              <tr>
                <th>Keyword</th>
                {isMultiLocation && <th>Market</th>}
                <th>Position</th>
                <th>Trend</th>
              </tr>
            </thead>
            <tbody>
              {goodKeywords.map((k) => (
                <tr key={k.id}>
                  <td>{k.keyword}</td>
                  {isMultiLocation && <td style={{ textAlign: "left", color: "#888", fontSize: 12 }}>{regionByEngine.get(k.site_engine_id) || "—"}</td>}
                  <td className={posClass(k.position)}>{k.position}</td>
                  <td className={trendClass(k.position_change)}>{trendLabel(k.position_change)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="rd-sh"><div className="rd-sh-left"><span className="rd-sh-num">03</span><span className="rd-sh-title">Needs Improvement</span></div><span className="rd-sh-badge">Opportunity</span></div>
        {needsImprovement.length === 0 ? (
          <p style={{ color: "#999", fontSize: 13, marginBottom: 40 }}>Every tracked keyword is already ranking in the top 10.</p>
        ) : (
          <table className="rd-rtable" style={{ marginBottom: 48 }}>
            <thead>
              <tr>
                <th>Keyword</th>
                {isMultiLocation && <th>Market</th>}
                <th>Position</th>
                <th>Trend</th>
              </tr>
            </thead>
            <tbody>
              {needsImprovement.map((k) => (
                <tr key={k.id}>
                  <td>{k.keyword}</td>
                  {isMultiLocation && <td style={{ textAlign: "left", color: "#888", fontSize: 12 }}>{regionByEngine.get(k.site_engine_id) || "—"}</td>}
                  <td className={posClass(k.position)}>{k.position && k.position > 0 ? k.position : "NR"}</td>
                  <td className={trendClass(k.position_change)}>{trendLabel(k.position_change)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="rd-divider">· · ·</div>

        <div className="rd-ai-eyebrow">Section 04</div>
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
                  {a.prompt && (
                    <div style={{ fontSize: 12, color: "#999", fontStyle: "italic", marginTop: 10, paddingTop: 10, borderTop: "1px solid #eee" }}>
                      &ldquo;{a.prompt}&rdquo;
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        <div className="rd-report-footer"><div className="rd-ft-brand">Powered by <span>Rehab CEOs</span></div></div>

        <ClientChat slug={params.slug} />
      </div>
    </div>
  );
}
