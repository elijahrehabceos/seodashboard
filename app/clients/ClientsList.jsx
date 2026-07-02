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

export default function ClientsList({ clients }) {
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
    <div className="rd-body">
      <div className="rd-cover">
        <div className="rd-cover-tl"></div><div className="rd-cover-tr"></div><div className="rd-cover-bl"></div><div className="rd-cover-br"></div>
        <div className="rd-cover-brand"><div className="rd-brand-line"></div><div className="rd-brand-text">Rehab CEOs</div><div className="rd-brand-line r"></div></div>
        <div className="rd-cover-eyebrow">Client Directory</div>
        <div className="rd-cover-title">Clients</div>
        <div className="rd-cover-domain">{clients.length} tracked accounts</div>
      </div>

      <div className="rd-page" style={{ maxWidth: 900 }}>
        <div style={{ marginBottom: 32 }}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a clinic or owner name..."
            style={{
              width: "100%",
              background: "#fff",
              border: "1px solid #ddd",
              borderRadius: 30,
              padding: "13px 22px",
              fontSize: 14,
              outline: "none",
              boxShadow: "0 1px 6px rgba(0,0,0,.04)",
            }}
          />
        </div>

        {filtered.length === 0 ? (
          <p style={{ color: "#999", fontSize: 13 }}>
            No client matches &ldquo;{query}&rdquo;.
          </p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {filtered.map((c) => (
              <Link
                key={c.slug}
                href={`/client/${c.slug}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  background: "#fff",
                  border: "1px solid #e8e8e8",
                  borderRadius: 12,
                  padding: "16px 18px",
                  textDecoration: "none",
                  boxShadow: "0 1px 6px rgba(0,0,0,.04)",
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    background: "rgba(205,161,88,.1)",
                    border: "1px solid rgba(205,161,88,.4)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 800,
                    color: "#cda158",
                    flexShrink: 0,
                  }}
                >
                  {initials(c.clinic_name)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: "#111", fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {c.clinic_name}
                  </div>
                  <div style={{ fontSize: 12.5, color: "#999" }}>{c.owner_name}</div>
                </div>
              </Link>
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
