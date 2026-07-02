import Link from "next/link";
import { supabase } from "@/lib/supabase";

export const revalidate = 3600;

async function getSpotlights() {
  const { data: keywords } = await supabase
    .from("keyword_rankings")
    .select("client_slug, keyword, position, position_change")
    .not("position_change", "is", null)
    .order("position_change", { ascending: false })
    .limit(50); // pull a batch, then split client-side into wins/drops

  if (!keywords || keywords.length === 0) return { wins: [], drops: [] };

  const slugs = [...new Set(keywords.map((k) => k.client_slug))];
  const { data: clients } = await supabase
    .from("clients")
    .select("slug, clinic_name")
    .in("slug", slugs);
  const nameBySlug = new Map((clients || []).map((c) => [c.slug, c.clinic_name]));

  const wins = keywords
    .filter((k) => k.position_change > 0)
    .sort((a, b) => b.position_change - a.position_change)
    .slice(0, 4)
    .map((k) => ({ ...k, clinic_name: nameBySlug.get(k.client_slug) }));

  const drops = keywords
    .filter((k) => k.position_change < 0)
    .sort((a, b) => a.position_change - b.position_change)
    .slice(0, 4)
    .map((k) => ({ ...k, clinic_name: nameBySlug.get(k.client_slug) }));

  return { wins, drops };
}

export default async function HomePage() {
  const { wins, drops } = await getSpotlights();

  return (
    <div className="rd-body">
      <div className="rd-cover">
        <div className="rd-cover-tl"></div><div className="rd-cover-tr"></div><div className="rd-cover-bl"></div><div className="rd-cover-br"></div>
        <div className="rd-cover-brand"><img src="/rehabceos-logo.webp" alt="Rehab CEOs" style={{ height: 30, width: "auto" }} /></div>
        <div className="rd-cover-eyebrow">Digital Marketing</div>
        <div className="rd-cover-title">SEO Dashboard</div>
        <div className="rd-cover-domain">Live rankings · AI visibility · Local pack</div>
        <div className="rd-cover-badges"><div className="rd-cbadge">Refreshed Daily</div></div>
      </div>

      <div className="rd-page" style={{ maxWidth: 900 }}>
        <div className="rd-sh">
          <div className="rd-sh-left">
            <span className="rd-sh-num">Menu</span>
            <span className="rd-sh-title">Where to?</span>
          </div>
        </div>

        <div className="rd-menu-grid">
          <Link href="/clients" className="rd-menu-card">
            <div className="rd-menu-card-eyebrow">55 Clients</div>
            <div className="rd-menu-card-title">Client Directory</div>
            <div className="rd-menu-card-desc">
              Browse every client, search by clinic or owner, and drill into
              keyword rankings, AI visibility, and local pack performance for
              each one.
            </div>
          </Link>

          <Link href="/kpi" className="rd-menu-card">
            <div className="rd-menu-card-eyebrow">Team Performance</div>
            <div className="rd-menu-card-title">SEO Team KPI</div>
            <div className="rd-menu-card-desc">
              Track how many clients are ranking in the Top 5 for their
              primary local keyword, at a glance.
            </div>
          </Link>
        </div>

        <div className="rd-divider">· · ·</div>

        <div className="rd-sh">
          <div className="rd-sh-left">
            <span className="rd-sh-num">01</span>
            <span className="rd-sh-title">Weekly Wins</span>
          </div>
          <span className="rd-sh-badge">This Week</span>
        </div>

        {wins.length === 0 ? (
          <p style={{ color: "#999", fontSize: 13, marginBottom: 40 }}>
            No ranking movement recorded yet.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 12, marginBottom: 48 }}>
            {wins.map((w, i) => (
              <div key={i} className="rd-hi-card" style={{ marginBottom: 0 }}>
                <div className="rd-hi-label green">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8l5-5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  {w.clinic_name}
                </div>
                <p>
                  Climbed <strong>{w.position_change} positions</strong> for
                  &ldquo;{w.keyword}&rdquo;, now sitting at{" "}
                  <strong>#{w.position}</strong>.
                </p>
              </div>
            ))}
          </div>
        )}

        <div className="rd-sh">
          <div className="rd-sh-left">
            <span className="rd-sh-num">02</span>
            <span className="rd-sh-title">Needs Attention</span>
          </div>
          <span className="rd-sh-badge">This Week</span>
        </div>

        {drops.length === 0 ? (
          <p style={{ color: "#999", fontSize: 13, marginBottom: 40 }}>
            No significant drops this week.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 12, marginBottom: 48 }}>
            {drops.map((d, i) => (
              <div key={i} className="rd-hi-card" style={{ marginBottom: 0 }}>
                <div className="rd-hi-label gold">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 13V3M3 8l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  {d.clinic_name}
                </div>
                <p>
                  Dropped <strong>{Math.abs(d.position_change)} positions</strong> for
                  &ldquo;{d.keyword}&rdquo;, now at <strong>#{d.position}</strong>.
                  Worth checking recent content changes, a competitor's new
                  push, or refreshing the page's on-page SEO.
                </p>
              </div>
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
