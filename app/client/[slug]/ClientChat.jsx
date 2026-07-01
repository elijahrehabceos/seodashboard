"use client";

import { useState } from "react";

export default function ClientChat({ slug }) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]); // {role, text}
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
    <section className="mt-12">
      <h2 className="text-xl font-bold mb-4 text-gold">Ask about this client</h2>
      <div className="bg-panel border border-white/10 rounded-xl p-5">
        {messages.length > 0 && (
          <div className="space-y-3 mb-4 max-h-72 overflow-y-auto">
            {messages.map((m, i) => (
              <div
                key={i}
                className={m.role === "user" ? "text-gray-300" : "text-white"}
              >
                <span className="text-xs uppercase tracking-wide text-gray-500 mr-2">
                  {m.role === "user" ? "You" : "Claude"}
                </span>
                {m.text}
              </div>
            ))}
            {loading && (
              <div className="text-gray-500 text-sm">Thinking...</div>
            )}
          </div>
        )}
        <form onSubmit={ask} className="flex gap-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. Why did rankings drop this week?"
            className="flex-1 bg-black/40 border border-white/10 rounded-full px-4 py-2.5 text-sm placeholder:text-gray-600 focus:outline-none focus:border-gold"
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-gold text-black font-bold text-sm px-5 py-2.5 rounded-full disabled:opacity-50"
          >
            Ask
          </button>
        </form>
      </div>
    </section>
  );
}
