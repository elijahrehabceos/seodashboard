import Link from "next/link";
import { supabase } from "@/lib/supabase";

export const revalidate = 3600;

// Matches the "{service} in {location}" pattern, e.g. "physical therapy in
// pasadena ca". Falls back to the earliest-tracked keyword if nothing
// matches this pattern for a given client.
const PRIMARY_PATTERN = /.+\bin\b.+/i;

async function getKpiData() {
  const [{ data: clients }, { data: keywords }] = await Promise.all([
    supabase.from("clients").select("slug, clinic_name, owner_name").order("clinic_name"),
    supabase.from("keyword_rankings").select("*").order("id", { ascending: true }),
  ]);

  const byClient = new Map();
  for (const k of keywords || []) {
    if (!byClient.has(k.client_slug)) byClient.set(k.client_slug, []);
    byClient.get(k.client_slug).push(k);
  }

  const rows = (clients || []).map((c) => {
    const clientKeywords = byClient.get(c.slug) || [];
    const primary =
      clientKeywords.find((k) => PRIMARY_PATTERN.test(k.keyword)) || clientKeywords[0] || null;

    // Use the best position seen so far THIS WEEK, not just today's snapshot.
    // Falls back to current position if weekly tracking hasn't kicked in yet.
    const effectivePosition = primary
      ? primary.best_position_week ?? primary.position
      : null;

    const inTop5 = !!(effectivePosition && effectivePosition > 0 && effectivePosition <= 5);
    const inTop10 = !!(effectivePosition && effectivePosition > 0 && effectivePosition <= 10);
    return { ...c, primary, effectivePosition, inTop5, inTop10 };
  });

  const top5Count = rows.filter((r) => r.inTop5).length;
  const top10Count = rows.filter((r) => r.inTop10).length;

  return { rows, top5Count, top10Count, totalCount: rows.length };
}

export default async function KpiPage() {
  const { rows, top5Count, top10Count, totalCount } = await getKpiData();
  const pct5 = totalCount ? Math.round((top5Count / totalCount) * 100) : 0;
  const pct10 = totalCount ? Math.round((top10Count / totalCount) * 100) : 0;
  const isGood5 = pct5 >= 50;
  const isGood10 = pct10 >= 50;

  return (
    <div className="rd-body">
      <div className="rd-cover">
        <div className="rd-cover-tl"></div><div className="rd-cover-tr"></div><div className="rd-cover-bl"></div><div className="rd-cover-br"></div>
        <div className="rd-cover-brand"><div className="rd-brand-line"></div><div className="rd-brand-text">Rehab CEOs</div><div className="rd-brand-line r"></div></div>
        <div className="rd-cover-eyebrow">Team Performance</div>
        <div className="rd-cover-title">SEO Team KPI</div>
        <div className="rd-cover-domain">Top 5 &amp; Top 10 on primary local keyword</div>
      </div>

      <div className="rd-page" style={{ maxWidth: 900 }}>
        <div className="rd-sh">
          <div className="rd-sh-left">
            <span className="rd-sh-num">KPI</span>
            <span className="rd-sh-title">Weekly Coverage</span>
          </div>
          <span className="rd-sh-badge">Live</span>
        </div>

        <div className="rd-kpi-grid">
          <div className="rd-kpi">
            <div className="rd-kpi-lbl">Clients Ranking Top 5</div>
            <div className={`rd-kpi-val ${isGood5 ? "g" : "gold"}`}>{top5Count} / {totalCount}</div>
            <div className="rd-kpi-sub">{pct5}% team rate this week</div>
          </div>
          <div className="rd-kpi">
            <div className="rd-kpi-lbl">Clients Ranking Top 10</div>
            <div className={`rd-kpi-val ${isGood10 ? "g" : "gold"}`}>{top10Count} / {totalCount}</div>
            <div className="rd-kpi-sub">{pct10}% team rate this week</div>
          </div>
          <div className="rd-kpi">
            <div className="rd-kpi-lbl">Top 5 Rate</div>
            <div className={`rd-kpi-val ${isGood5 ? "g" : "gold"}`}>{pct5}%</div>
            <div className="rd-kpi-sub">Across all clients</div>
          </div>
        </div>

        <div className="rd-hi-card">
          <div className="rd-hi-label gold">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/><path d="M8 5v4M8 11v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            How this is calculated
          </div>
          <p>
            For each client, the primary keyword is detected by matching the
            &ldquo;service in location&rdquo; pattern (e.g. &ldquo;physical
            therapy in pasadena ca&rdquo;). A client counts toward Top 5 or
            Top 10 if that keyword hit that position <strong>at any point
            during the current week</strong>, not just on today&apos;s check,
            since daily rankings can bounce around.
          </p>
        </div>

        <div className="rd-divider">· · ·</div>

        <table className="rd-rtable">
          <thead>
            <tr><th>Clinic</th><th>Primary Keyword</th><th>Best This Week</th><th>Top 5?</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.slug}>
                <td>
                  <Link href={`/client/${r.slug}`} className="rd-kpi-link">
                    {r.clinic_name}
                  </Link>
                </td>
                <td style={{ textAlign: "left", color: "#666", fontSize: 12.5 }}>
                  {r.primary ? r.primary.keyword : "No keyword data yet"}
                </td>
                <td className={r.inTop5 ? "p1" : "pw"}>
                  {r.effectivePosition && r.effectivePosition > 0 ? `#${r.effectivePosition}` : "—"}
                </td>
                <td className={r.inTop5 ? "p1" : "pnr"}>{r.inTop5 ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="rd-report-footer">
          <div className="rd-ft-brand">Powered by <span>Rehab CEOs</span></div>
        </div>
      </div>
    </div>
  );
}
