import { createClient } from "@supabase/supabase-js";

// Server-side only — uses the service role key so it can read data,
// and the Anthropic key never reaches the browser.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function POST(req) {
  try {
    const { slug, question } = await req.json();
    if (!slug || !question) {
      return Response.json({ error: "Missing slug or question" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: "Ask-a-client isn't configured yet (missing ANTHROPIC_API_KEY)." },
        { status: 501 }
      );
    }

    const [{ data: client }, { data: keywords }, { data: ai }, { data: local }, { data: insight }] =
      await Promise.all([
        supabase.from("clients").select("*").eq("slug", slug).single(),
        supabase.from("keyword_rankings").select("*").eq("client_slug", slug),
        supabase.from("ai_visibility").select("*").eq("client_slug", slug),
        supabase.from("local_pack").select("*").eq("client_slug", slug),
        supabase.from("client_insights").select("*").eq("client_slug", slug).maybeSingle(),
      ]);

    if (!client) {
      return Response.json({ error: "Client not found" }, { status: 404 });
    }

    const prompt = `You are an SEO analyst answering a quick question for an
internal agency dashboard. Clinic: ${client.clinic_name} (owner: ${client.owner_name}).

Keyword rankings: ${JSON.stringify(keywords)}
AI visibility: ${JSON.stringify(ai)}
Local pack: ${JSON.stringify(local)}
Existing summary note: ${insight?.blurb || "none yet"}

Question from the team: ${question}

Answer in 2-4 plain sentences, no markdown, no em dashes. If the data doesn't
cover the question, say so plainly instead of guessing.`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 400,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const json = await res.json();
    const answer = json?.content?.find((b) => b.type === "text")?.text?.trim();

    if (!answer) {
      return Response.json({ error: "No answer returned" }, { status: 502 });
    }

    return Response.json({ answer });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Something went wrong" }, { status: 500 });
  }
}
