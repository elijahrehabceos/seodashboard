"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/clients", label: "Clients" },
  { href: "/kpi", label: "SEO Team KPI" },
];

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <nav className="rd-nav">
      <div className="rd-nav-inner">
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          {pathname !== "/" && (
            <button
              onClick={() => router.back()}
              aria-label="Go back"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "rgba(255,255,255,.55)",
                display: "flex",
                alignItems: "center",
                padding: 0,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,.55)")}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" />
              </svg>
            </button>
          )}
          <Link href="/" className="rd-nav-brand">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#cda158" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h4l2-7 4 14 2-7h6" />
            </svg>
            REHAB CEOS SEO
          </Link>
        </div>
        <div className="rd-nav-links">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rd-nav-link ${pathname === l.href ? "active" : ""}`}
            >
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
