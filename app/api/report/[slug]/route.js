import { createClient } from "@supabase/supabase-js";
import clientsData from "../../../../data/clients.json" with { type: "json" };
import { generateReportForClient } from "../../../../scripts/generate-report.mjs";

export const maxDuration = 60; // allow up to 60s for the Claude calls + assembly

export async function GET(req, { params }) {
  const { slug } = params;
  const client = clientsData.find((c) => c.slug === slug);
  if (!client) {
    return Response.json({ error: "Client not found" }, { status: 404 });
  }

  try {
    const { html } = await generateReportForClient(client);
    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Report generation failed", details: err.message }, { status: 500 });
  }
}
