import { createClient } from "@supabase/supabase-js";
import { generateReportForClient } from "../../../../scripts/generate-report.mjs";

export const maxDuration = 60; // allow up to 60s for the Claude calls + assembly

export async function GET(req, { params }) {
  const { slug } = params;

  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const { data: client } = await supabase.from("clients").select("*").eq("slug", slug).single();
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
