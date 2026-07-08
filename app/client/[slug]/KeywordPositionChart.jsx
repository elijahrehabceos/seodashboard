"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer, ReferenceLine } from "recharts";

function truncate(text, max = 28) {
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

export default function KeywordPositionChart({ keywords }) {
  // Chart wants "higher bar = better", but rank 1 is the best position, so
  // we plot an inverted value (100 - position) and label the real position.
  const data = keywords
    .slice()
    .sort((a, b) => (a.position || 999) - (b.position || 999))
    .slice(0, 12) // keep it readable — top 12 keywords by position
    .map((k) => ({
      name: truncate(k.keyword),
      fullName: k.keyword,
      value: k.position && k.position > 0 ? Math.max(100 - k.position, 4) : 2,
      position: k.position && k.position > 0 ? k.position : null,
      good: k.position && k.position > 0 && k.position <= 10,
    }));

  if (data.length === 0) return null;

  return (
    <div style={{ width: "100%", height: Math.max(data.length * 34, 200) }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, left: 4, bottom: 4 }}>
          <XAxis type="number" hide domain={[0, 100]} />
          <YAxis
            type="category"
            dataKey="name"
            width={170}
            tick={{ fontSize: 12, fill: "#555", fontFamily: "Manrope, sans-serif" }}
            axisLine={false}
            tickLine={false}
          />
          <ReferenceLine x={90} stroke="#ddd" strokeDasharray="3 3" />
          <Tooltip
            formatter={(value, name, props) => [props.payload.position ? `#${props.payload.position}` : "Not ranked", "Position"]}
            labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName || label}
            contentStyle={{ fontFamily: "Manrope, sans-serif", fontSize: 12, borderRadius: 8, border: "1px solid #e8e8e8" }}
          />
          <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={18}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.good ? "#16a34a" : "#cda158"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
