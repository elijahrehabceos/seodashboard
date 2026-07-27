"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

function formatWeek(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export default function HistoryTrendChart({ history }) {
  if (!history || history.length < 2) {
    return (
      <p style={{ color: "#999", fontSize: 13 }}>
        Not enough weekly history yet to show a trend, check back after a few more weekly updates.
      </p>
    );
  }

  const data = history
    .slice()
    .sort((a, b) => new Date(a.week_start) - new Date(b.week_start))
    .map((h) => ({ week: formatWeek(h.week_start), position: h.position }));

  const positions = data.map((d) => d.position).filter((p) => p != null);
  const maxPos = Math.max(...positions, 10);

  return (
    <div style={{ width: "100%", height: 220 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 4 }}>
          <CartesianGrid stroke="#f0f0f0" vertical={false} />
          <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#999", fontFamily: "Manrope, sans-serif" }} axisLine={{ stroke: "#eee" }} tickLine={false} />
          <YAxis reversed domain={[1, maxPos]} tick={{ fontSize: 11, fill: "#999", fontFamily: "Manrope, sans-serif" }} axisLine={false} tickLine={false} width={28} />
          <Tooltip
            formatter={(value) => [`#${value}`, "Position"]}
            contentStyle={{ fontFamily: "Manrope, sans-serif", fontSize: 12, borderRadius: 8, border: "1px solid #e8e8e8" }}
          />
          <Line type="monotone" dataKey="position" stroke="#cda158" strokeWidth={2.5} dot={{ r: 4, fill: "#cda158" }} activeDot={{ r: 6 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
