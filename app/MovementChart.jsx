"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer } from "recharts";

function truncate(text, max = 30) {
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

export default function MovementChart({ wins, needsAttention }) {
  const data = [
    ...wins.map((w) => ({
      name: truncate(w.clinic_name),
      value: w.position_change,
      type: "win",
    })),
    ...needsAttention.map((d) => ({
      name: truncate(d.clinic_name),
      value: -(d.position || 30),
      type: "attention",
    })),
  ];

  if (data.length === 0) return null;

  return (
    <div style={{ width: "100%", height: Math.max(data.length * 32, 160) }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 30, left: 4, bottom: 4 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            width={150}
            tick={{ fontSize: 12, fill: "#555", fontFamily: "Manrope, sans-serif" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            formatter={(value, name, props) =>
              props.payload.type === "win" ? [`+${value} positions`, "Climbed"] : [`#${Math.abs(value)}`, "Current position"]
            }
            contentStyle={{ fontFamily: "Manrope, sans-serif", fontSize: 12, borderRadius: 8, border: "1px solid #e8e8e8" }}
          />
          <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={16}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.type === "win" ? "#16a34a" : "#cda158"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
