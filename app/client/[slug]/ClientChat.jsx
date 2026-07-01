"use client";

import { useState } from "react";

export default function ClientChat({ slug }) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  async function ask(e) {
    e.preventDefault();
    const q = question.trim();
    if (!q || loading) return;
    setMessages((m) => [...m, { role: "user", text: q }]);
    setQuestion("");
    setLoading(true);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, question: q }),
      });
      const json = await res.json();
      setMessages((m) => [
        ...m,
        { role: "assistant", text: json.answer || json.error || "No response." },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: "Something went wrong asking that." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ background: "#111", borderRadius: 12, padding: "28px 32px", marginTop: 40 }}>
      <div style={{ fontSize: 10, letterSpacing: "0.18em", fontWeight: 800, color: "#cda158", textTransform: "uppercase", marginBottom: 16 }}>
        Ask About This Client
      </div>

      {messages.length > 0 && (
        <div style={{ marginBottom: 16, maxHeight: 260, overflowY: "auto" }}>
          {messages.map((m, i) => (
            <p key={i} style={{ fontSize: 14, lineHeight: 1.85, color: m.role === "user" ? "rgba(255,255,255,.6)" : "rgba(255,255,255,.9)", marginBottom: 10 }}>
              <span style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#666", marginRight: 8 }}>
                {m.role === "user" ? "You" : "Claude"}
              </span>
              {m.text}
            </p>
          ))}
          {loading && <p style={{ color: "#666", fontSize: 13 }}>Thinking...</p>}
        </div>
      )}

      <form onSubmit={ask} style={{ display: "flex", gap: 8 }}>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. Why did rankings drop this week?"
          style={{
            flex: 1,
            background: "rgba(255,255,255,.06)",
            border: "1px solid rgba(255,255,255,.12)",
            borderRadius: 30,
            padding: "10px 18px",
            fontSize: 13,
            color: "#fff",
            outline: "none",
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
            padding: "10px 22px",
            borderRadius: 30,
            border: "none",
            opacity: loading ? 0.5 : 1,
            cursor: loading ? "default" : "pointer",
          }}
        >
          Ask
        </button>
      </form>
    </div>
  );
}
