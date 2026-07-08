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
    const publicUrl = await generateReportForClient(client);
    // Redirect straight to the generated file so clicking the button
    // opens/downloads the report immediately.
    return Response.redirect(publicUrl, 302);
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Report generation failed", details: err.message }, { status: 500 });
  }
}
