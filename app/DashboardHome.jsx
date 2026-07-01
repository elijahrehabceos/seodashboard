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
    <main className="min-h-screen relative overflow-hidden">
      {/* ambient signature: a faint pulse / vital-sign line tracing behind the hero */}
      <svg
        className="absolute top-0 left-0 w-full h-[420px] opacity-[0.15] pointer-events-none"
        viewBox="0 0 1200 420"
        preserveAspectRatio="none"
      >
        <polyline
          points="0,220 260,220 300,120 340,320 380,60 420,220 1200,220"
          fill="none"
          stroke="#cda158"
          strokeWidth="1.5"
        />
      </svg>

      <div className="relative max-w-6xl mx-auto px-6 pt-20 pb-16">
        <div className="flex items-center gap-2 text-xs tracking-[0.2em] uppercase text-gold/70 mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-gold inline-block" />
          REHAB CEOS
        </div>

        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight">
          REHAB CEOS <span className="text-gold">SEO DASHBOARD</span>
        </h1>
        <p className="text-gray-400 mt-3 text-lg">
          Rankings, AI visibility, and local pack, refreshed daily.
        </p>

        {/* search */}
        <div className="mt-10 max-w-xl">
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
              className="w-full bg-panel border border-white/10 rounded-full pl-11 pr-5 py-3.5 text-sm placeholder:text-gray-500 focus:outline-none focus:border-gold transition-colors"
            />
          </div>
        </div>

        {/* results */}
        <div className="mt-12">
          {filtered.length === 0 ? (
            <p className="text-gray-500 text-sm">
              No client matches &ldquo;{query}&rdquo;.
            </p>
          ) : (
            <div className="divide-y divide-white/[0.06] border-t border-white/[0.06]">
              {filtered.map((c) => (
                <Link
                  key={c.slug}
                  href={`/client/${c.slug}`}
                  className="group flex items-center gap-4 py-4 hover:bg-white/[0.02] transition-colors px-2 -mx-2 rounded-lg"
                >
                  <div className="w-10 h-10 rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center text-xs font-bold text-gold shrink-0">
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
        </div>
      </div>
    </main>
  );
}
