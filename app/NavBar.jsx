"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/clients", label: "Clients" },
  { href: "/kpi", label: "SEO Team KPI" },
];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="rd-nav">
      <div className="rd-nav-inner">
        <Link href="/" className="rd-nav-brand">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#cda158" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h4l2-7 4 14 2-7h6" />
          </svg>
          REHAB CEOS SEO
        </Link>
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
