"use client";

import { useState } from "react";
import clientsData from "../../data/clients.json";

export default function BlogGeneratorPage() {
  const [clientSlug, setClientSlug] = useState("");
  const [keyword, setKeyword] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const sortedClients = [...clientsData].sort((a, b) => a.clinic_name.localeCompare(b.clinic_name));

  async function generate(e) {
    e.preventDefault();
    if (!clientSlug || !keyword.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/blog-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientSlug, keyword, notes }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Something went wrong");
      } else {
        setResult(json);
      }
    } catch {
      setError("Something went wrong generating that post.");
    } finally {
      setLoading(false);
    }
  }

  function copyHtml() {
    if (!result) return;
    navigator.clipboard.writeText(result.bodyHtml);
  }

  const wordCountColor =
    result && result.wordCount >= 900 && result.wordCount <= 1200 ? "#16a34a" : "#cda158";

  return (
    <div className="rd-body">
      <div className="rd-cover">
        <div className="rd-orbit-dot"></div>
        <div className="rd-cover-tl"></div><div className="rd-cover-tr"></div><div className="rd-cover-bl"></div><div className="rd-cover-br"></div>
        <div className="rd-cover-brand"><img src="/rehabceos-logo.webp" alt="Rehab CEOs" style={{ height: 30, width: "auto" }} /></div>
        <div className="rd-cover-eyebrow">Content Tool</div>
        <div className="rd-cover-title">Blog Generator</div>
        <div className="rd-cover-domain">900-1200 words, real internal &amp; external links</div>
      </div>

      <div className="rd-page" style={{ maxWidth: 900 }}>
        <form onSubmit={generate} style={{ display: "grid", gap: 16, marginBottom: 32 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".1em", color: "#999", textTransform: "uppercase", display: "block", marginBottom: 8 }}>
              1. Client
            </label>
            <select
              value={clientSlug}
              onChange={(e) => setClientSlug(e.target.value)}
              style={{
                width: "100%",
                background: "#fff",
                border: "1px solid #ddd",
                borderRadius: 10,
                padding: "12px 16px",
                fontSize: 14,
                outline: "none",
              }}
            >
              <option value="">Select a client...</option>
              {sortedClients.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.clinic_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".1em", color: "#999", textTransform: "uppercase", display: "block", marginBottom: 8 }}>
              2. Main Keyword
            </label>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="e.g. lower back pain physical therapy"
              style={{
                width: "100%",
                background: "#fff",
                border: "1px solid #ddd",
                borderRadius: 10,
                padding: "12px 16px",
                fontSize: 14,
                outline: "none",
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".1em", color: "#999", textTransform: "uppercase", display: "block", marginBottom: 8 }}>
              3. Other Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any angle, tone, or specifics Claude should know..."
              rows={3}
              style={{
                width: "100%",
                background: "#fff",
                border: "1px solid #ddd",
                borderRadius: 10,
                padding: "12px 16px",
                fontSize: 14,
                outline: "none",
                fontFamily: "inherit",
                resize: "vertical",
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !clientSlug || !keyword.trim()}
            style={{
              background: "#cda158",
              color: "#000",
              fontWeight: 700,
              fontSize: 14,
              padding: "13px 28px",
              borderRadius: 30,
              border: "none",
              cursor: loading ? "default" : "pointer",
              opacity: loading || !clientSlug || !keyword.trim() ? 0.5 : 1,
              justifySelf: "start",
            }}
          >
            {loading ? "Writing... (this can take a minute)" : "Generate Blog Post"}
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
              <div className="rd-kpi" style={{ gridColumn: "span 2" }}>
                <div className="rd-kpi-lbl">Title</div>
                <div style={{ fontSize: 18, fontWeight: 800, marginTop: 6 }}>{result.title}</div>
              </div>
              <div className="rd-kpi">
                <div className="rd-kpi-lbl">Word Count</div>
                <div className="rd-kpi-val" style={{ color: wordCountColor }}>{result.wordCount}</div>
                <div className="rd-kpi-sub">Target: 900-1200</div>
              </div>
            </div>

            <div className="rd-hi-card">
              <div className="rd-hi-label gold">Meta Description ({result.metaDescription.length} chars)</div>
              <p>{result.metaDescription}</p>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
              <button
                onClick={copyHtml}
                style={{
                  background: "#111",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 12.5,
                  padding: "9px 20px",
                  borderRadius: 30,
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Copy HTML
              </button>
            </div>

            <div
              style={{
                background: "#fff",
                border: "1px solid #e8e8e8",
                borderRadius: 12,
                padding: "32px 36px",
                lineHeight: 1.75,
                fontSize: 15,
              }}
              dangerouslySetInnerHTML={{ __html: result.bodyHtml }}
            />

            <div className="rd-report-footer">
              <div className="rd-ft-brand">Powered by <span>Rehab CEOs</span></div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
