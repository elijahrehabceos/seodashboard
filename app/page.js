import Link from "next/link";
import { supabase } from "@/lib/supabase";
import MovementChart from "./MovementChart";

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

  const wins = keywords
    .filter((k) => k.position_change > 0 && k.position_change < 20)
    .sort((a, b) => b.position_change - a.position_change)
    .slice(0, 4)
    .map((k) => ({ ...k, clinic_name: nameBySlug.get(k.client_slug) }));

  const needsAttention = keywords
    .filter((k) => k.position && k.position > 5)
    .sort((a, b) => b.position - a.position)
    .slice(0, 4)
    .map((k) => ({ ...k, clinic_name: nameBySlug.get(k.client_slug) }));

  return { wins, needsAttention };
}

const SECTIONS = [
  {
    href: "/clients",
    title: "Client Directory",
    desc: "Browse every client, search by clinic or owner, and drill into rankings, AI visibility, and local pack performance.",
    tag: "55 Clients",
  },
  {
    href: "/kpi",
    title: "SEO Team KPI",
    desc: "Track how many clients are ranking in the Top 5 for their primary local keyword, at a glance.",
    tag: "Team Performance",
  },
  {
    href: "/priority",
    title: "Priority Queue",
    desc: "Skip scrolling all 55 clients, see who actually needs attention today and why.",
    tag: "Where To Focus",
  },
  {
    href: "/audit",
    title: "Site Audit",
    desc: "Drop any URL, get a prioritized technical SEO punch list in seconds.",
    tag: "Onboarding Tool",
  },
  {
    href: "/blog-generator",
    title: "Blog Generator",
    desc: "900-1200 word posts with real internal links and live-searched external sources.",
    tag: "Content Tool",
  },
];

export default async function HomePage() {
  const { wins, needsAttention } = await getSpotlights();

  return (
    <div className="rd-body">
      <div className="rd-cover">
        <div className="rd-cover-tl"></div><div className="rd-cover-tr"></div><div className="rd-cover-bl"></div><div className="rd-cover-br"></div>
        <div style={{ maxWidth: 640, position: "relative", zIndex: 2 }}>
          <div className="rd-kicker" style={{ justifyContent: "center" }}>
            <span className="rd-kicker-line"></span>
            <span className="rd-kicker-text">Rehab CEOs Digital Marketing</span>
            <span className="rd-kicker-line"></span>
          </div>
          <div className="rd-hero-title" style={{ textAlign: "center" }}>SEO Dashboard</div>
          <p className="rd-hero-sub" style={{ textAlign: "center" }}>Live rankings, AI visibility, and local pack performance across the full client roster.</p>
          <div className="rd-hero-meta" style={{ textAlign: "center" }}>Refreshed Daily</div>
        </div>
      </div>

      <div className="rd-page" style={{ maxWidth: 820, paddingTop: 72 }}>
        <div className="rd-section-label">Navigate</div>
        <div className="rd-index-list">
          {SECTIONS.map((s, i) => (
            <Link key={s.href} href={s.href} className="rd-index-row animate-fade-up" style={{ animationDelay: `${i * 0.05}s` }}>
              <span className="rd-index-num">{String(i + 1).padStart(2, "0")}</span>
              <div className="rd-index-body">
                <div className="rd-index-title">{s.title}</div>
                <div className="rd-index-desc">{s.desc}</div>
              </div>
              <span className="rd-index-tag">{s.tag}</span>
              <svg className="rd-index-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ))}
        </div>

        {(wins.length > 0 || needsAttention.length > 0) && (
          <div style={{ marginTop: 72, marginBottom: 16 }}>
            <div className="rd-section-label">This Week At A Glance</div>
            <MovementChart wins={wins} needsAttention={needsAttention} />
          </div>
        )}

        <div style={{ marginTop: 72 }}>
          <div className="rd-section-label">Weekly Wins</div>
          {wins.length === 0 ? (
            <p style={{ color: "#999", fontSize: 13, marginBottom: 40 }}>No ranking movement recorded yet.</p>
          ) : (
            <div className="rd-note-list">
              {wins.map((w, i) => (
                <div key={i} className="rd-note-row animate-fade-up" style={{ animationDelay: `${0.05 * i}s` }}>
                  <span className="rd-note-dot green"></span>
                  <div>
                    <div className="rd-note-title">{w.clinic_name}</div>
                    <div className="rd-note-body">
                      Climbed <strong>{w.position_change} positions</strong> for &ldquo;{w.keyword}&rdquo;, now sitting at <strong>#{w.position}</strong>.
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginTop: 56 }}>
          <div className="rd-section-label">Needs Attention</div>
          {needsAttention.length === 0 ? (
            <p style={{ color: "#999", fontSize: 13 }}>Every tracked keyword is currently in a strong position.</p>
          ) : (
            <div className="rd-note-list">
              {needsAttention.map((d, i) => (
                <div key={i} className="rd-note-row animate-fade-up" style={{ animationDelay: `${0.05 * i}s` }}>
                  <span className="rd-note-dot gold"></span>
                  <div>
                    <div className="rd-note-title">{d.clinic_name}</div>
                    <div className="rd-note-body">
                      Currently at <strong>#{d.position}</strong> for &ldquo;{d.keyword}&rdquo;. {suggestionFor(d.position)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rd-report-footer">
          <div className="rd-ft-brand">Powered by <span>Rehab CEOs</span></div>
        </div>
      </div>
    </div>
  );
}
