"use client";

import { useState } from "react";

function severityColor(sev) {
  if (sev === "critical") return "#dc2626";
  if (sev === "warning") return "#cda158";
  return "#16a34a";
}
function severityLabel(sev) {
  if (sev === "critical") return "Critical";
  if (sev === "warning") return "Warning";
  return "Pass";
}

export default function AuditPage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function runAudit(e) {
    e.preventDefault();
    if (!url.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Something went wrong");
      } else {
        setResult(json);
      }
    } catch {
      setError("Something went wrong reaching that URL.");
    } finally {
      setLoading(false);
    }
  }

  const sorted = result
    ? [...result.checks].sort((a, b) => {
        const order = { critical: 0, warning: 1, pass: 2 };
        return order[a.severity] - order[b.severity];
      })
    : [];

  return (
    <div className="rd-body">
      <div className="rd-cover">
        <div className="rd-orbit-dot"></div>
        <div className="rd-cover-tl"></div><div className="rd-cover-tr"></div><div className="rd-cover-bl"></div><div className="rd-cover-br"></div>
        <div className="rd-cover-brand"><img src="/rehabceos-logo.webp" alt="Rehab CEOs" style={{ height: 30, width: "auto" }} /></div>
        <div className="rd-cover-eyebrow">Onboarding Tool</div>
        <div className="rd-cover-title">Site Audit</div>
        <div className="rd-cover-domain">Drop a link, get a prioritized fix list</div>
      </div>

      <div className="rd-page" style={{ maxWidth: 900 }}>
        <form onSubmit={runAudit} style={{ display: "flex", gap: 10, marginBottom: 32 }}>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="e.g. clientwebsite.com"
            style={{
              flex: 1,
              background: "#fff",
              border: "1px solid #ddd",
              borderRadius: 30,
              padding: "13px 22px",
              fontSize: 14,
              outline: "none",
              boxShadow: "0 1px 6px rgba(0,0,0,.04)",
            }}
          />
          <button
            type="submit"
            disabled={loading}
            style={{
              background: "#cda158",
              color: "#000",
              fontWeight: 700,
              fontSize: 13,
              padding: "10px 28px",
              borderRadius: 30,
              border: "none",
              cursor: loading ? "default" : "pointer",
              opacity: loading ? 0.6 : 1,
              whiteSpace: "nowrap",
            }}
          >
            {loading ? "Auditing..." : "Run Audit"}
          </button>
        </form>

        {error && (
          <div className="rd-hi-card" style={{ borderLeftColor: "#dc2626" }}>
            <p style={{ color: "#dc2626" }}>{error}</p>
          </div>
        )}

        {result && (
          <>
            <div className="rd-kpi-grid">
              <div className="rd-kpi">
                <div className="rd-kpi-lbl">Critical Issues</div>
                <div className="rd-kpi-val" style={{ color: result.counts.critical > 0 ? "#dc2626" : "#16a34a" }}>
                  {result.counts.critical}
                </div>
                <div className="rd-kpi-sub">Fix these first</div>
              </div>
              <div className="rd-kpi">
                <div className="rd-kpi-lbl">Warnings</div>
                <div className="rd-kpi-val gold">{result.counts.warning}</div>
                <div className="rd-kpi-sub">Worth addressing</div>
              </div>
              <div className="rd-kpi">
                <div className="rd-kpi-lbl">Passed Checks</div>
                <div className="rd-kpi-val g">{result.counts.pass}</div>
                <div className="rd-kpi-sub">Already solid</div>
              </div>
            </div>

            {result.narrative && (
              <div className="rd-hi-card">
                <div className="rd-hi-label gold">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/><path d="M8 5v4M8 11v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  Summary
                </div>
                <p>{result.narrative}</p>
              </div>
            )}

            <div className="rd-divider">· · ·</div>

            <div style={{ display: "grid", gap: 10 }}>
              {sorted.map((c) => (
                <div
                  key={c.id}
                  style={{
                    background: "#fff",
                    border: "1px solid #e8e8e8",
                    borderLeft: `3px solid ${severityColor(c.severity)}`,
                    borderRadius: 10,
                    padding: "16px 20px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 16,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3 }}>{c.label}</div>
                    <div style={{ fontSize: 12.5, color: "#777" }}>{c.detail}</div>
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: ".08em",
                      textTransform: "uppercase",
                      color: severityColor(c.severity),
                      border: `1.5px solid ${severityColor(c.severity)}`,
                      borderRadius: 20,
                      padding: "4px 12px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {severityLabel(c.severity)}
                  </span>
                </div>
              ))}
            </div>

            <div className="rd-report-footer">
              <div className="rd-ft-brand">Powered by <span>Rehab CEOs</span></div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
