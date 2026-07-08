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

function PageCard({ page }) {
  const [open, setOpen] = useState(false);

  if (page.error) {
    return (
      <div className="rd-hi-card" style={{ borderLeftColor: "#dc2626" }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{page.url}</div>
        <p style={{ color: "#dc2626" }}>{page.error}</p>
      </div>
    );
  }

  const critical = page.checks.filter((c) => c.severity === "critical").length;
  const warning = page.checks.filter((c) => c.severity === "warning").length;
  const hasContentIssues = page.contentIssues && !page.contentIssues.toLowerCase().includes("no content issues");

  return (
    <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 12, marginBottom: 16, overflow: "hidden" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "16px 20px",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, color: "#111", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {page.url}
          </div>
          <div style={{ fontSize: 12, color: "#999", marginTop: 3 }}>
            {critical > 0 && <span style={{ color: "#dc2626", fontWeight: 700, marginRight: 10 }}>{critical} critical</span>}
            {warning > 0 && <span style={{ color: "#cda158", fontWeight: 700, marginRight: 10 }}>{warning} warning</span>}
            {page.brokenLinks?.length > 0 && <span style={{ color: "#dc2626", fontWeight: 700, marginRight: 10 }}>{page.brokenLinks.length} broken link{page.brokenLinks.length > 1 ? "s" : ""}</span>}
            {page.shortcodeArtifacts?.length > 0 && <span style={{ color: "#dc2626", fontWeight: 700, marginRight: 10 }}>{page.shortcodeArtifacts.length} shortcode artifact{page.shortcodeArtifacts.length > 1 ? "s" : ""}</span>}
            {hasContentIssues && <span style={{ color: "#cda158", fontWeight: 700 }}>content issues found</span>}
            {critical === 0 && warning === 0 && !page.brokenLinks?.length && !page.shortcodeArtifacts?.length && !hasContentIssues && (
              <span style={{ color: "#16a34a", fontWeight: 700 }}>All clear</span>
            )}
          </div>
        </div>
        <span style={{ fontSize: 18, color: "#999", flexShrink: 0, marginLeft: 12 }}>{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div style={{ padding: "0 20px 20px", borderTop: "1px solid #f0f0f0" }}>
          <div style={{ display: "grid", gap: 8, marginTop: 16, marginBottom: 16 }}>
            {page.checks.map((c) => (
              <div key={c.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ color: "#555" }}>{c.label}: <span style={{ color: "#111" }}>{c.detail}</span></span>
                <span style={{ color: severityColor(c.severity), fontWeight: 700, fontSize: 11, textTransform: "uppercase" }}>
                  {severityLabel(c.severity)}
                </span>
              </div>
            ))}
          </div>

          {page.brokenLinks?.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".1em", color: "#dc2626", textTransform: "uppercase", marginBottom: 8 }}>
                Broken Links
              </div>
              {page.brokenLinks.map((l, i) => (
                <div key={i} style={{ fontSize: 12.5, color: "#555", marginBottom: 4 }}>
                  <span style={{ color: "#dc2626", fontWeight: 700 }}>{l.status || "unreachable"}</span> — {l.url}
                </div>
              ))}
            </div>
          )}

          {page.shortcodeArtifacts?.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".1em", color: "#dc2626", textTransform: "uppercase", marginBottom: 8 }}>
                Shortcode / Template Errors
              </div>
              {page.shortcodeArtifacts.map((s, i) => (
                <div key={i} style={{ fontSize: 12.5, fontFamily: "monospace", color: "#555", marginBottom: 4 }}>
                  {s}
                </div>
              ))}
            </div>
          )}

          {hasContentIssues && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".1em", color: "#cda158", textTransform: "uppercase", marginBottom: 8 }}>
                Content Review
              </div>
              <p style={{ fontSize: 13, color: "#444", lineHeight: 1.7, whiteSpace: "pre-line" }}>{page.contentIssues}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
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

  return (
    <div className="rd-body">
      <div className="rd-cover">
        <div className="rd-orbit-dot"></div>
        <div className="rd-cover-tl"></div><div className="rd-cover-tr"></div><div className="rd-cover-bl"></div><div className="rd-cover-br"></div>
        <div className="rd-cover-brand"><img src="/rehabceos-logo.webp" alt="Rehab CEOs" style={{ height: 30, width: "auto" }} /></div>
        <div className="rd-cover-eyebrow">Onboarding Tool</div>
        <div className="rd-cover-title">Site Audit</div>
        <div className="rd-cover-domain">Drop a link, scan the whole site</div>
      </div>

      <div className="rd-page" style={{ maxWidth: 900 }}>
        <form onSubmit={runAudit} style={{ display: "flex", gap: 10, marginBottom: 16 }}>
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
            {loading ? "Scanning..." : "Run Audit"}
          </button>
        </form>
        {loading && (
          <p style={{ color: "#999", fontSize: 12.5, marginBottom: 24 }}>
            Crawling up to 8 pages and reviewing content, this can take a minute or two.
          </p>
        )}

        {error && (
          <div className="rd-hi-card" style={{ borderLeftColor: "#dc2626" }}>
            <p style={{ color: "#dc2626" }}>{error}</p>
          </div>
        )}

        {result && (
          <>
            <div className="rd-kpi-grid">
              <div className="rd-kpi">
                <div className="rd-kpi-lbl">Pages Scanned</div>
                <div className="rd-kpi-val">{result.pagesScanned}</div>
                <div className="rd-kpi-sub">via {result.pageSource}</div>
              </div>
              <div className="rd-kpi">
                <div className="rd-kpi-lbl">Critical Issues</div>
                <div className="rd-kpi-val" style={{ color: result.totals.critical > 0 ? "#dc2626" : "#16a34a" }}>
                  {result.totals.critical}
                </div>
                <div className="rd-kpi-sub">Across all pages</div>
              </div>
              <div className="rd-kpi">
                <div className="rd-kpi-lbl">Broken Links</div>
                <div className="rd-kpi-val" style={{ color: result.totals.brokenLinks > 0 ? "#dc2626" : "#16a34a" }}>
                  {result.totals.brokenLinks}
                </div>
                <div className="rd-kpi-sub">Found across all pages</div>
              </div>
              <div className="rd-kpi">
                <div className="rd-kpi-lbl">Shortcode Errors</div>
                <div className="rd-kpi-val" style={{ color: result.totals.shortcodeArtifacts > 0 ? "#dc2626" : "#16a34a" }}>
                  {result.totals.shortcodeArtifacts}
                </div>
                <div className="rd-kpi-sub">Broken template artifacts</div>
              </div>
            </div>

            <div className="rd-divider">· · ·</div>

            <div>
              {result.scannedPages.map((page, i) => (
                <PageCard key={i} page={page} />
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
