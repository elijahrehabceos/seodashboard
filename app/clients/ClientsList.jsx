"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export default function ClientsList({ clients }) {
  const [query, setQuery] = useState("");
  const [batchStatus, setBatchStatus] = useState(null); // null | 'loading' | 'started' | 'error'

  async function triggerBatch() {
    setBatchStatus("loading");
    try {
      const res = await fetch("/api/report-batch", { method: "POST" });
      const json = await res.json();
      setBatchStatus(res.ok ? "started" : "error");
    } catch {
      setBatchStatus("error");
    }
  }

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
        <div className="rd-cover-brand"><img src="/rehabceos-logo.webp" alt="Rehab CEOs" style={{ height: 30, width: "auto" }} /></div>
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

        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 32 }}>
          <button
            onClick={triggerBatch}
            disabled={batchStatus === "loading"}
            style={{
              background: "#cda158",
              color: "#000",
              fontWeight: 700,
              fontSize: 13,
              padding: "10px 22px",
              borderRadius: 30,
              border: "none",
              cursor: batchStatus === "loading" ? "default" : "pointer",
              opacity: batchStatus === "loading" ? 0.6 : 1,
            }}
          >
            {batchStatus === "loading" ? "Starting..." : "Generate All Monthly Reports"}
          </button>
          {batchStatus === "started" && (
            <span style={{ fontSize: 13, color: "#16a34a", fontWeight: 600 }}>
              Started — check the GitHub Actions tab, this takes a few minutes for all 55.
            </span>
          )}
          {batchStatus === "error" && (
            <span style={{ fontSize: 13, color: "#cda158", fontWeight: 600 }}>
              Couldn&apos;t start batch generation. Check the GITHUB token is configured.
            </span>
          )}
        </div>

        {filtered.length === 0 ? (
          <p style={{ color: "#999", fontSize: 13 }}>
            No client matches &ldquo;{query}&rdquo;.
          </p>
        ) : (
          <div style={{ borderTop: "1px solid #e0e0e0" }}>
            {filtered.map((c, i) => (
              <Link
                key={c.slug}
                href={`/client/${c.slug}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "22px 4px",
                  textDecoration: "none",
                  borderBottom: "1px solid #e0e0e0",
                  animationDelay: `${Math.min(i * 0.025, 0.6)}s`,
                }}
                className="rd-directory-row animate-fade-up"
              >
                <div>
                  <div style={{ fontWeight: 900, color: "#111", fontSize: 22, letterSpacing: "-.01em" }}>
                    {c.clinic_name}
                  </div>
                  <div style={{ fontSize: 13, color: "#999", marginTop: 4 }}>{c.owner_name}</div>
                </div>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#cda158" strokeWidth="2" style={{ flexShrink: 0 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
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
