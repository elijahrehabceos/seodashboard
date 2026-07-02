import Link from "next/link";

export default function HomePage() {
  return (
    <div className="rd-body">
      <div className="rd-cover">
        <div className="rd-cover-tl"></div><div className="rd-cover-tr"></div><div className="rd-cover-bl"></div><div className="rd-cover-br"></div>
        <div className="rd-cover-brand"><div className="rd-brand-line"></div><div className="rd-brand-text">Rehab CEOs</div><div className="rd-brand-line r"></div></div>
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
            <div className="rd-menu-card-title">Clients</div>
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

        <div className="rd-report-footer">
          <div className="rd-ft-brand">Powered by <span>Rehab CEOs</span></div>
        </div>
      </div>
    </div>
  );
}
