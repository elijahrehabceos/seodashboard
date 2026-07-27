import Link from "next/link";
import { supabase } from "@/lib/supabase";
import TeamDistributionChart from "./kpi/TeamDistributionChart";

export const revalidate = 3600;

const EXCLUDED_OWNERS = new Set([
  "Amy Robinson",
  "Darin Deaton | Trey Taylor",
  "Michael Chua",
  "Avi Singh",
]);

async function getSnapshotData() {
  const [{ data: clients }, { data: keywords }] = await Promise.all([
    supabase.from("clients").select("slug, clinic_name, owner_name").order("clinic_name"),
    supabase.from("keyword_rankings").select("*").eq("is_primary", true),
  ]);

  const primaryByClient = new Map((keywords || []).map((k) => [k.client_slug, k]));

  const rows = (clients || [])
    .filter((c) => !EXCLUDED_OWNERS.has(c.owner_name))
    .map((c) => {
      const primary = primaryByClient.get(c.slug) || null;
      const effectivePosition = primary ? primary.best_position_week ?? primary.position : null;
      const inTop5 = !!(effectivePosition && effectivePosition > 0 && effectivePosition <= 3);
      const inTop10 = !!(effectivePosition && effectivePosition > 0 && effectivePosition <= 10);
      return { ...c, primary, effectivePosition, inTop5, inTop10 };
    });

  const top5Count = rows.filter((r) => r.inTop5).length;
  const top10Count = rows.filter((r) => r.inTop10).length;

  const needsWork = rows
    .filter((r) => r.effectivePosition && r.effectivePosition > 10)
    .sort((a, b) => b.effectivePosition - a.effectivePosition)
    .slice(0, 5);

  return {
    rows,
    top5Count,
    top10Count,
    totalCount: rows.length,
    totalClients: (clients || []).length,
    needsWork,
  };
}

export default async function HomePage() {
  const { rows, top5Count, top10Count, totalCount, totalClients, needsWork } = await getSnapshotData();
  const pct5 = totalCount ? Math.round((top5Count / totalCount) * 100) : 0;
  const pct10 = totalCount ? Math.round((top10Count / totalCount) * 100) : 0;
  const isGood5 = pct5 >= 50;
  const isGood10 = pct10 >= 50;

  return (
    <div className="rd-body">
      <div className="rd-cover">
        <div className="rd-cover-tl"></div><div className="rd-cover-tr"></div><div className="rd-cover-bl"></div><div className="rd-cover-br"></div>
        <div className="rd-cover-brand"><img src="/rehabceos-logo.webp" alt="Rehab CEOs" style={{ height: 30, width: "auto" }} /></div>
        <div className="rd-cover-eyebrow">Rehab CEOs Digital Marketing</div>
        <div className="rd-cover-title">SEO Dashboard</div>
        <div className="rd-cover-domain">Everything, at a glance</div>
      </div>

      <div className="rd-page" style={{ maxWidth: 900 }}>
        {/* ---- KPI Snapshot (the big one) ---- */}
        <div className="rd-sh">
          <div className="rd-sh-left">
            <span className="rd-sh-num">01</span>
            <span className="rd-sh-title">SEO Team KPI</span>
          </div>
          <Link href="/kpi" className="rd-sh-badge" style={{ textDecoration: "none" }}>Full Report →</Link>
        </div>

        <div className="rd-kpi-grid">
          <div className="rd-kpi">
            <div className="rd-kpi-lbl">Clients Ranking Top 3</div>
            <div className={`rd-kpi-val ${isGood5 ? "g" : "gold"}`}>{top5Count} / {totalCount}</div>
            <div className="rd-kpi-sub">{pct5}% team rate this week</div>
          </div>
          <div className="rd-kpi">
            <div className="rd-kpi-lbl">Clients Ranking Top 10</div>
            <div className={`rd-kpi-val ${isGood10 ? "g" : "gold"}`}>{top10Count} / {totalCount}</div>
            <div className="rd-kpi-sub">{pct10}% team rate this week</div>
          </div>
          <div className="rd-kpi">
            <div className="rd-kpi-lbl">Top 10 Rate</div>
            <div className={`rd-kpi-val ${isGood10 ? "g" : "gold"}`}>{pct10}%</div>
            <div className="rd-kpi-sub">Across all clients</div>
          </div>
        </div>

        <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 12, padding: "24px 24px 8px", marginBottom: 20 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".1em", color: "#999", textTransform: "uppercase", marginBottom: 4 }}>
            Client Position Distribution
          </div>
          <TeamDistributionChart rows={rows} />
        </div>

        <div className="rd-divider">· · ·</div>

        {/* ---- Needs Work Snapshot ---- */}
        <div className="rd-sh">
          <div className="rd-sh-left">
            <span className="rd-sh-num">02</span>
            <span className="rd-sh-title">Needs Work</span>
          </div>
          <Link href="/priority" className="rd-sh-badge" style={{ textDecoration: "none" }}>Priority Queue →</Link>
        </div>

        {needsWork.length === 0 ? (
          <p style={{ color: "#999", fontSize: 13, marginBottom: 40 }}>Every client is ranking reasonably well right now.</p>
        ) : (
          <div className="rd-note-list">
            {needsWork.map((r, i) => (
              <div key={r.slug} className="rd-note-row animate-fade-up" style={{ animationDelay: `${0.05 * i}s` }}>
                <span className="rd-note-dot gold"></span>
                <div style={{ flex: 1 }}>
                  <div className="rd-note-title">
                    <Link href={`/client/${r.slug}`} style={{ color: "inherit", textDecoration: "none" }}>{r.clinic_name}</Link>
                  </div>
                  <div className="rd-note-body">
                    Currently at <strong>#{r.effectivePosition}</strong> for &ldquo;{r.primary?.keyword}&rdquo;.
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="rd-divider">· · ·</div>

        {/* ---- Client Directory Snapshot ---- */}
        <div className="rd-sh">
          <div className="rd-sh-left">
            <span className="rd-sh-num">03</span>
            <span className="rd-sh-title">Client Directory</span>
          </div>
          <Link href="/clients" className="rd-sh-badge" style={{ textDecoration: "none" }}>Browse All →</Link>
        </div>

        <Link
          href="/clients"
          className="rd-menu-card animate-fade-up"
          style={{ display: "block", marginBottom: 56, textAlign: "center", padding: "36px 24px" }}
        >
          <div className="rd-kpi-val" style={{ fontSize: 48 }}>{totalClients}</div>
          <div style={{ fontSize: 13, color: "#999", marginTop: 6 }}>Clients tracked — search by clinic or owner name</div>
        </Link>

        {/* ---- Other tools ---- */}
        <div className="rd-section-label">More Tools</div>
        <div className="rd-index-list">
          <Link href="/audit" className="rd-index-row">
            <span className="rd-index-num">04</span>
            <div className="rd-index-body">
              <div className="rd-index-title">Site Audit</div>
              <div className="rd-index-desc">Drop any URL, get a prioritized technical SEO punch list.</div>
            </div>
            <svg className="rd-index-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
          <Link href="/blog-generator" className="rd-index-row">
            <span className="rd-index-num">05</span>
            <div className="rd-index-body">
              <div className="rd-index-title">Blog Generator</div>
              <div className="rd-index-desc">900-1200 word posts with real internal and external links.</div>
            </div>
            <svg className="rd-index-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        <div className="rd-report-footer">
          <div className="rd-ft-brand">Powered by <span>Rehab CEOs</span></div>
        </div>
      </div>
    </div>
  );
}
