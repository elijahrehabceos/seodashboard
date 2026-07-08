import Link from "next/link";
import { supabase } from "@/lib/supabase";

export const revalidate = 3600;

const EXCLUDED_OWNERS = new Set([
  "Amy Robinson",
  "Darin Deaton | Trey Taylor",
  "Michael Chua",
  "Avi Singh",
]);

async function getPriorityData() {
  const [{ data: clients }, { data: keywords }, { data: ai }, { data: recommendations }] = await Promise.all([
    supabase.from("clients").select("slug, clinic_name, owner_name").order("clinic_name"),
    supabase.from("keyword_rankings").select("*"),
    supabase.from("ai_visibility").select("*"),
    supabase.from("priority_recommendations").select("*"),
  ]);

  const recByClient = new Map((recommendations || []).map((r) => [r.client_slug, r]));

  const kwByClient = new Map();
  for (const k of keywords || []) {
    if (!kwByClient.has(k.client_slug)) kwByClient.set(k.client_slug, []);
    kwByClient.get(k.client_slug).push(k);
  }
  const aiByClient = new Map();
  for (const a of ai || []) {
    if (!aiByClient.has(a.client_slug)) aiByClient.set(a.client_slug, []);
    aiByClient.get(a.client_slug).push(a);
  }

  const rows = (clients || [])
    .filter((c) => !EXCLUDED_OWNERS.has(c.owner_name))
    .map((c) => {
      const kws = kwByClient.get(c.slug) || [];
      const aiRows = aiByClient.get(c.slug) || [];
      const reasons = [];

      const primary = kws.find((k) => k.is_primary);
      const primaryBest = primary ? primary.best_position_week ?? primary.position : null;
      if (primary && (!primaryBest || primaryBest > 5)) {
        reasons.push({
          text: `Primary keyword "${primary.keyword}" isn't in the Top 5 this week (currently #${primaryBest || "NR"}).`,
          weight: 3,
        });
      }

      const biggestDrop = kws
        .filter((k) => k.position_change < 0)
        .sort((a, b) => a.position_change - b.position_change)[0];
      if (biggestDrop && biggestDrop.position_change <= -3) {
        reasons.push({
          text: `"${biggestDrop.keyword}" dropped ${Math.abs(biggestDrop.position_change)} positions this week.`,
          weight: 2,
        });
      }

      if (aiRows.length > 0 && aiRows.every((a) => !a.mentioned)) {
        reasons.push({
          text: `Not mentioned on any tracked AI engine (${aiRows.map((a) => a.engine).join(", ")}).`,
          weight: 1,
        });
      }

      const rankedCount = kws.filter((k) => k.position > 0).length;
      const trackedCount = kws.length;
      if (trackedCount > 0 && rankedCount / trackedCount < 0.5) {
        reasons.push({
          text: `Only ${rankedCount} of ${trackedCount} tracked keywords are ranking at all.`,
          weight: 2,
        });
      }

      const score = reasons.reduce((s, r) => s + r.weight, 0);
      const recommendation = recByClient.get(c.slug)?.recommendation || null;
      return { ...c, reasons, score, recommendation };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  return rows;
}

export default async function PriorityPage() {
  const rows = await getPriorityData();

  return (
    <div className="rd-body">
      <div className="rd-cover">
        <div className="rd-cover-tl"></div><div className="rd-cover-tr"></div><div className="rd-cover-bl"></div><div className="rd-cover-br"></div>
        <div className="rd-cover-brand"><img src="/rehabceos-logo.webp" alt="Rehab CEOs" style={{ height: 30, width: "auto" }} /></div>
        <div className="rd-cover-eyebrow">Where To Focus</div>
        <div className="rd-cover-title">Priority Queue</div>
        <div className="rd-cover-domain">Who needs attention today</div>
      </div>

      <div className="rd-page" style={{ maxWidth: 900 }}>
        <div className="rd-sh">
          <div className="rd-sh-left">
            <span className="rd-sh-num">Today</span>
            <span className="rd-sh-title">{rows.length} client{rows.length === 1 ? "" : "s"} flagged</span>
          </div>
          <span className="rd-sh-badge">Live</span>
        </div>

        {rows.length === 0 ? (
          <p style={{ color: "#999", fontSize: 13 }}>
            Nothing urgent right now, every client is hitting their basics.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {rows.map((r, i) => (
              <Link
                key={r.slug}
                href={`/client/${r.slug}`}
                className="rd-hi-card animate-fade-up"
                style={{
                  display: "block",
                  textDecoration: "none",
                  color: "inherit",
                  marginBottom: 0,
                  animationDelay: `${Math.min(i * 0.04, 0.6)}s`,
                }}
              >
                <div className={`rd-hi-label ${r.score >= 4 ? "gold" : "green"}`}>
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M8 5v4M8 11v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  {r.clinic_name} <span style={{ fontWeight: 500, color: "#999", marginLeft: 6 }}>· {r.owner_name}</span>
                </div>
                <div style={{ display: "grid", gap: 4 }}>
                  {r.reasons.map((reason, j) => (
                    <p key={j} style={{ margin: 0 }}>
                      {reason.text}
                    </p>
                  ))}
                </div>
                {r.recommendation && (
                  <div
                    style={{
                      marginTop: 12,
                      paddingTop: 12,
                      borderTop: "1px solid #eee",
                      fontSize: 13,
                      color: "#111",
                    }}
                  >
                    <span style={{ fontWeight: 800, color: "#cda158", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase" }}>
                      Recommended Action
                    </span>
                    <p style={{ margin: "4px 0 0" }}>{r.recommendation}</p>
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}

        <div className="rd-report-footer">
          <div className="rd-ft-brand">Powered by <span>Rehab CEOs</span></div>
        </div>
      </div>
    </div>
  );
}
