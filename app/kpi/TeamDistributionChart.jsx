"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer } from "recharts";

export default function TeamDistributionChart({ rows }) {
  const buckets = [
    { label: "Top 3", min: 1, max: 3, color: "#16a34a" },
    { label: "4-5", min: 4, max: 5, color: "#16a34a" },
    { label: "6-10", min: 6, max: 10, color: "#cda158" },
    { label: "11-20", min: 11, max: 20, color: "#cda158" },
    { label: "21+", min: 21, max: Infinity, color: "#dc2626" },
    { label: "Not ranked", min: null, max: null, color: "#bbb" },
  ];

  const data = buckets.map((b) => {
    const count = rows.filter((r) => {
      const pos = r.effectivePosition;
      if (b.min === null) return !pos || pos <= 0;
      return pos && pos >= b.min && pos <= b.max;
    }).length;
    return { name: b.label, value: count, color: b.color };
  });

  return (
    <div style={{ width: "100%", height: 220 }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 20, right: 10, left: 0, bottom: 4 }}>
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: "#777", fontFamily: "Manrope, sans-serif" }}
            axisLine={{ stroke: "#eee" }}
            tickLine={false}
          />
          <YAxis hide />
          <Tooltip
            formatter={(value) => [`${value} client${value === 1 ? "" : "s"}`, ""]}
            contentStyle={{ fontFamily: "Manrope, sans-serif", fontSize: 12, borderRadius: 8, border: "1px solid #e8e8e8" }}
          />
          <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={60} label={{ position: "top", fontSize: 13, fontWeight: 700, fill: "#111" }}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
