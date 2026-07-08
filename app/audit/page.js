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
        <a href={page.url} target="_blank" rel="noreferrer" style={{ fontWeight: 700, fontSize: 13, color: "#111" }}>
          {page.url} ↗
        </a>
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
          <a
            href={page.url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{
              fontWeight: 700,
              fontSize: 13.5,
              color: "#111",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "block",
              textDecoration: "none",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#cda158")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#111")}
          >
            {page.url} ↗
          </a>
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
                  <span style={{ color: "#dc2626", fontWeight: 700 }}>{l.status || "unreachable"}</span> —{" "}
                  <a href={l.url} target="_blank" rel="noreferrer" style={{ color: "#555" }}>
                    {l.url}
                  </a>
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

          {page.contentIssues && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".1em", color: hasContentIssues ? "#cda158" : "#16a34a", textTransform: "uppercase", marginBottom: 8 }}>
                Content Review
              </div>
              <p style={{ fontSize: 13, color: "#444", lineHeight: 1.7, whiteSpace: "pre-line" }}>{page.contentIssues}</p>
            </div>
          )}
          {!page.contentIssues && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".1em", color: "#999", textTransform: "uppercase", marginBottom: 8 }}>
                Content Review
              </div>
              <p style={{ fontSize: 13, color: "#999" }}>Not available (Claude API key may not be configured).</p>
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
  const [status, setStatus] = useState("");
  const [pages, setPages] = useState([]); // discovered page URLs
  const [results, setResults] = useState({}); // url -> result
  const [error, setError] = useState(null);

  async function runAudit(e) {
    e.preventDefault();
    if (!url.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResults({});
    setPages([]);
    setStatus("Finding pages...");

    try {
      const discoverRes = await fetch("/api/audit/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const discoverJson = await discoverRes.json();
      if (!discoverRes.ok) {
        setError(discoverJson.error || "Couldn't discover pages on that site.");
        setLoading(false);
        return;
      }

      const pageList = discoverJson.pages;
      setPages(pageList);
      setStatus(`Found ${pageList.length} pages via ${discoverJson.source}. Scanning...`);

      // Process with limited concurrency so we don't hammer the target site
      // or blow past API rate limits, but still work through large sites.
      const CONCURRENCY = 2;
      let index = 0;
      async function worker() {
        while (index < pageList.length) {
          const myIndex = index++;
          const pageUrl = pageList[myIndex];
          try {
            const res = await fetch("/api/audit/page-check", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url: pageUrl }),
            });
            const json = await res.json();
            setResults((prev) => ({ ...prev, [pageUrl]: json }));
          } catch {
            setResults((prev) => ({ ...prev, [pageUrl]: { url: pageUrl, error: "Request failed" } }));
          }
        }
      }
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
      setStatus("");
    } catch {
      setError("Something went wrong reaching that URL.");
    } finally {
      setLoading(false);
    }
  }

  const scannedPages = pages.map((p) => results[p]).filter(Boolean);
  const completedCount = scannedPages.length;
  const totals = scannedPages.reduce(
    (acc, p) => {
      if (p.error) return acc;
      acc.critical += p.checks.filter((c) => c.severity === "critical").length;
      acc.warning += p.checks.filter((c) => c.severity === "warning").length;
      acc.brokenLinks += p.brokenLinks?.length || 0;
      acc.shortcodeArtifacts += p.shortcodeArtifacts?.length || 0;
      return acc;
    },
    { critical: 0, warning: 0, brokenLinks: 0, shortcodeArtifacts: 0 }
  );

  return (
    <div className="rd-body">
      <div className="rd-cover">
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
            {status || "Scanning..."} {pages.length > 0 && `(${completedCount} of ${pages.length} done)`}
          </p>
        )}

        {error && (
          <div className="rd-hi-card" style={{ borderLeftColor: "#dc2626" }}>
            <p style={{ color: "#dc2626" }}>{error}</p>
          </div>
        )}

        {pages.length > 0 && (
          <>
            <div className="rd-kpi-grid">
              <div className="rd-kpi">
                <div className="rd-kpi-lbl">Pages Found</div>
                <div className="rd-kpi-val">{completedCount} / {pages.length}</div>
                <div className="rd-kpi-sub">{loading ? "Scanning..." : "Scan complete"}</div>
              </div>
              <div className="rd-kpi">
                <div className="rd-kpi-lbl">Critical Issues</div>
                <div className="rd-kpi-val" style={{ color: totals.critical > 0 ? "#dc2626" : "#16a34a" }}>
                  {totals.critical}
                </div>
                <div className="rd-kpi-sub">So far</div>
              </div>
              <div className="rd-kpi">
                <div className="rd-kpi-lbl">Broken Links</div>
                <div className="rd-kpi-val" style={{ color: totals.brokenLinks > 0 ? "#dc2626" : "#16a34a" }}>
                  {totals.brokenLinks}
                </div>
                <div className="rd-kpi-sub">Found so far</div>
              </div>
              <div className="rd-kpi">
                <div className="rd-kpi-lbl">Shortcode Errors</div>
                <div className="rd-kpi-val" style={{ color: totals.shortcodeArtifacts > 0 ? "#dc2626" : "#16a34a" }}>
                  {totals.shortcodeArtifacts}
                </div>
                <div className="rd-kpi-sub">Broken template artifacts</div>
              </div>
            </div>

            <div className="rd-divider">· · ·</div>

            <div>
              {pages.map((pageUrl, i) =>
                results[pageUrl] ? (
                  <PageCard key={i} page={results[pageUrl]} />
                ) : (
                  <div key={i} style={{ background: "#fafafa", border: "1px solid #eee", borderRadius: 12, padding: "16px 20px", marginBottom: 16, fontSize: 13, color: "#aaa" }}>
                    {pageUrl} — waiting to scan...
                  </div>
                )
              )}
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
