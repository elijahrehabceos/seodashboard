"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

function initials(name) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export default function DashboardHome({ clients }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.clinic_name.toLowerCase().includes(q) ||
        c.owner_name.toLowerCase().includes(q)
    );
  }, [query, clients]);

  return (
    <main className="min-h-screen relative">
      {/* subtle vignette so the black feels intentional, not just #000 */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(ellipse 900px 500px at 50% -10%, rgba(205,161,88,0.10), transparent 60%)",
        }}
      />

      {/* hero */}
      <section className="relative border-b border-white/[0.07]">
        <svg
          className="absolute top-0 left-0 w-full h-[440px] opacity-25 pointer-events-none"
          viewBox="0 0 1200 440"
          preserveAspectRatio="none"
        >
          <polyline
            className="animate-draw-pulse"
            points="0,260 220,260 265,150 310,370 355,60 400,260 1200,260"
            fill="none"
            stroke="#cda158"
            strokeWidth="1.5"
          />
        </svg>

        <div className="relative max-w-6xl mx-auto px-6 pt-16 pb-20">
          <div className="flex items-center gap-2.5 mb-8 animate-fade-up">
            <span className="w-8 h-8 rounded-full border border-gold/40 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-4 h-4 text-gold" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h4l2-7 4 14 2-7h6" />
              </svg>
            </span>
            <span className="text-[11px] tracking-[0.25em] uppercase text-gold/70">
              RCEOs Digital Marketing
            </span>
          </div>

          <h1
            className="text-5xl sm:text-6xl font-extrabold tracking-tight leading-[1.05] animate-fade-up"
            style={{ animationDelay: "0.08s" }}
          >
            Rehab CEOs
            <br />
            <span className="text-gold">SEO Dashboard</span>
          </h1>
          <p
            className="text-gray-400 mt-5 text-lg max-w-md animate-fade-up"
            style={{ animationDelay: "0.16s" }}
          >
            Rankings, AI visibility, and local pack performance, refreshed
            every day.
          </p>

          <div
            className="mt-10 max-w-xl animate-fade-up"
            style={{ animationDelay: "0.24s" }}
          >
            <div className="relative">
              <svg
                className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z"
                />
              </svg>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search a clinic or owner name..."
                className="w-full bg-panel/80 backdrop-blur border border-white/10 rounded-full pl-11 pr-5 py-3.5 text-sm placeholder:text-gray-500 focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold/40 transition-all"
              />
            </div>
          </div>
        </div>
      </section>

      {/* client list */}
      <section className="relative max-w-6xl mx-auto px-6 py-14">
        {filtered.length === 0 ? (
          <p className="text-gray-500 text-sm">
            No client matches &ldquo;{query}&rdquo;.
          </p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {filtered.map((c) => (
              <Link
                key={c.slug}
                href={`/client/${c.slug}`}
                className="group relative flex items-center gap-4 bg-panel/60 border border-white/[0.08] rounded-2xl px-5 py-4 hover:border-gold/50 hover:bg-panel transition-all duration-200 overflow-hidden"
              >
                <span className="absolute left-0 top-0 h-full w-[3px] bg-gold scale-y-0 group-hover:scale-y-100 transition-transform origin-top duration-200" />

                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-gold/20 to-gold/5 border border-gold/30 flex items-center justify-center text-xs font-bold text-gold shrink-0">
                  {initials(c.clinic_name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold truncate group-hover:text-gold transition-colors">
                    {c.clinic_name}
                  </div>
                  <div className="text-sm text-gray-500 truncate">
                    {c.owner_name}
                  </div>
                </div>
                <svg
                  className="w-4 h-4 text-gray-600 group-hover:text-gold group-hover:translate-x-0.5 transition-all shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </Link>
            ))}
          </div>
        )}
      </section>

      <footer className="relative max-w-6xl mx-auto px-6 pb-10">
        <div className="border-t border-white/[0.07] pt-6 text-xs text-gray-600">
          Rehab CEOs SEO Dashboard — internal tool for RCEOs Digital Marketing
        </div>
      </footer>
    </main>
  );
}
