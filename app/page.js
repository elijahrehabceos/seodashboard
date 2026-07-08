import Link from "next/link";
import { supabase } from "@/lib/supabase";

export const revalidate = 3600;

function suggestionFor(position) {
  if (position > 20) {
    return "Not yet ranking on page 1 or 2. Worth a fresh on-page pass and a look at whether the location page has enough unique, locally-relevant content.";
  }
  if (position > 10) {
    return "Sitting on page 2. A few strong local backlinks or an updated GBP post cadence could help close the gap to page 1.";
  }
  return "On page 1 but outside the top 10. Tightening up on-page keyword targeting and internal links to this page should help it climb further.";
}

async function getSpotlights() {
  const { data: keywords } = await supabase
    .from("keyword_rankings")
    .select("client_slug, keyword, position, position_change")
    .not("position_change", "is", null);

  if (!keywords || keywords.length === 0) return { wins: [], needsAttention: [] };

  const slugs = [...new Set(keywords.map((k) => k.client_slug))];
  const { data: clients } = await supabase
    .from("clients")
    .select("slug, clinic_name")
    .in("slug", slugs);
  const nameBySlug = new Map((clients || []).map((c) => [c.slug, c.clinic_name]));

  // Wins: real, believable movement only. A 20+ position jump in a single
  // week is almost always a newly onboarded client's first real check-in,
  // not an actual ranking win, so those are excluded.
  const wins = keywords
    .filter((k) => k.position_change > 0 && k.position_change < 20)
    .sort((a, b) => b.position_change - a.position_change)
    .slice(0, 4)
    .map((k) => ({ ...k, clinic_name: nameBySlug.get(k.client_slug) }));

  // Needs attention: not about drops — about who's currently ranking
  // lowest, with a concrete next step for each.
  const needsAttention = keywords
    .filter((k) => k.position && k.position > 5)
    .sort((a, b) => b.position - a.position)
    .slice(0, 4)
    .map((k) => ({ ...k, clinic_name: nameBySlug.get(k.client_slug) }));

  return { wins, needsAttention };
}

export default async function HomePage() {
  const { wins, needsAttention } = await getSpotlights();

  return (
    <div className="rd-body">
      <div className="rd-cover">
        <div className="rd-orbit-dot"></div>
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
          <Link href="/clients" className="rd-menu-card animate-fade-up" style={{ animationDelay: "0.05s" }}>
            <div className="rd-menu-card-eyebrow">55 Clients</div>
            <div className="rd-menu-card-title">Client Directory</div>
            <div className="rd-menu-card-desc">
              Browse every client, search by clinic or owner, and drill into
              keyword rankings, AI visibility, and local pack performance for
              each one.
            </div>
          </Link>

          <Link href="/kpi" className="rd-menu-card animate-fade-up" style={{ animationDelay: "0.15s" }}>
            <div className="rd-menu-card-eyebrow">Team Performance</div>
            <div className="rd-menu-card-title">SEO Team KPI</div>
            <div className="rd-menu-card-desc">
              Track how many clients are ranking in the Top 5 for their
              primary local keyword, at a glance.
            </div>
          </Link>

          <Link href="/priority" className="rd-menu-card animate-fade-up" style={{ animationDelay: "0.25s" }}>
            <div className="rd-menu-card-eyebrow">Where To Focus</div>
            <div className="rd-menu-card-title">Priority Queue</div>
            <div className="rd-menu-card-desc">
              Skip scrolling all 55 clients, see who actually needs
              attention today and why.
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
              <div key={i} className="rd-hi-card animate-fade-up" style={{ marginBottom: 0, animationDelay: `${0.05 * i}s` }}>
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
          <span className="rd-sh-badge">Opportunity</span>
        </div>

        {needsAttention.length === 0 ? (
          <p style={{ color: "#999", fontSize: 13, marginBottom: 40 }}>
            Every tracked keyword is currently in a strong position.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 12, marginBottom: 48 }}>
            {needsAttention.map((d, i) => (
              <div key={i} className="rd-hi-card animate-fade-up" style={{ marginBottom: 0, animationDelay: `${0.05 * i}s` }}>
                <div className="rd-hi-label gold">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/><path d="M8 5v4M8 11v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  {d.clinic_name}
                </div>
                <p>
                  Currently at <strong>#{d.position}</strong> for &ldquo;{d.keyword}&rdquo;.{" "}
                  {suggestionFor(d.position)}
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
