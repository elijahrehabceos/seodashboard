import * as cheerio from "cheerio";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 120;

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function safeFetch(url, opts = {}) {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": BROWSER_UA, ...(opts.headers || {}) },
      ...opts,
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } catch {
    return { ok: false, status: null, text: "" };
  }
}

async function discoverInternalPages(domain) {
  const origin = `https://${domain}`;
  const robots = await safeFetch(`${origin}/robots.txt`);
  const declared = [];
  if (robots.ok) {
    for (const m of robots.text.matchAll(/^\s*sitemap:\s*(\S+)/gim)) declared.push(m[1].trim());
  }
  const candidates = [...declared, `${origin}/sitemap_index.xml`, `${origin}/sitemap.xml`, `${origin}/wp-sitemap.xml`];

  for (const candidate of candidates) {
    const sm = await safeFetch(candidate);
    if (!sm.ok) continue;
    const $ = cheerio.load(sm.text, { xmlMode: true });
    if (sm.text.includes("<sitemapindex")) {
      const children = $("sitemap > loc").map((i, el) => $(el).text().trim()).get();
      const all = [];
      for (const child of children.slice(0, 10)) {
        const childSm = await safeFetch(child);
        if (childSm.ok) {
          const $c = cheerio.load(childSm.text, { xmlMode: true });
          all.push(...$c("loc").map((i, el) => $c(el).text().trim()).get());
        }
        if (all.length >= 60) break;
      }
      if (all.length) return all.slice(0, 60);
    } else {
      const urls = $("loc").map((i, el) => $(el).text().trim()).get().filter(Boolean);
      if (urls.length) return urls.slice(0, 60);
    }
  }

  // Fallback: crawl homepage links if no sitemap found.
  const homepage = await safeFetch(origin);
  if (!homepage.ok) return [];
  const $ = cheerio.load(homepage.text);
  const found = new Set();
  $("a[href]").each((i, el) => {
    const href = $(el).attr("href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
    try {
      const abs = new URL(href, origin);
      abs.hash = "";
      if (abs.hostname === new URL(origin).hostname) found.add(abs.toString());
    } catch {}
  });
  return [...found].slice(0, 60);
}

export async function POST(req) {
  try {
    const { clientSlug, keyword, notes } = await req.json();
    if (!clientSlug || !keyword) {
      return Response.json({ error: "Client and main keyword are required" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return Response.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 501 });

    const supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: client } = await supabase
      .from("clients")
      .select("*")
      .eq("slug", clientSlug)
      .single();
    if (!client) return Response.json({ error: "Client not found" }, { status: 404 });

    const internalPages = await discoverInternalPages(client.domain);

    const prompt = `Write a blog post for ${client.clinic_name} (${client.domain}), a
physical therapy / wellness clinic. Main keyword to target: "${keyword}".
${notes ? `Additional notes from the team: ${notes}` : ""}

Requirements:
- Length: 900 to 1200 words, no shorter, no longer
- Structure: one H1 (the title), several H2s, H3s where useful for sub-points
- The main keyword must appear naturally in the title and meta description,
  in 1-2 of the headers (H2/H3), and 4-5 times total across the body text.
  Natural placement, never forced or stuffed beyond that count.
- Include as many INTERNAL links as make sense contextually, using ONLY these
  real pages from the client's own site (pick whichever are actually
  relevant to the topic, don't force irrelevant ones):
${internalPages.map((p) => `  - ${p}`).join("\n")}
- Include 2-3 EXTERNAL links to genuinely authoritative sources (medical
  associations, research, government health sites, etc.) — use the web
  search tool to find real, current, relevant sources. Never invent a URL.
- No em dashes anywhere. Confident, plain, human tone, not generic AI
  filler.
- Meta description: 145 characters max, includes a short call to action.

Output in EXACTLY this format, nothing else before or after:

TITLE: [the H1 title here]
META: [the meta description here]
BODY:
[full HTML body starting with the H1 as an <h1> tag, then <h2>/<h3>/<p>/<a
href="..."> tags as appropriate. Internal links use the real URLs listed
above. External links use real URLs found via search. Do not wrap in
markdown code fences.]`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
        tools: [{ type: "web_search_20250305", name: "web_search" }],
      }),
    });
    const json = await res.json();
    const fullText = (json?.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    const titleMatch = fullText.match(/TITLE:\s*(.+)/);
    const metaMatch = fullText.match(/META:\s*(.+)/);
    const bodyMatch = fullText.match(/BODY:\s*([\s\S]+)/);

    const title = titleMatch ? titleMatch[1].trim() : keyword;
    const metaDescription = metaMatch ? metaMatch[1].trim() : "";
    const bodyHtml = bodyMatch ? bodyMatch[1].trim() : fullText;

    const plainText = bodyHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const wordCount = plainText.split(" ").filter(Boolean).length;

    await supabase.from("generated_blogs").insert({
      client_slug: clientSlug,
      keyword,
      title,
      meta_description: metaDescription,
      body_html: bodyHtml,
      word_count: wordCount,
      notes: notes || null,
    });

    return Response.json({ title, metaDescription, bodyHtml, wordCount, internalPagesConsidered: internalPages.length });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Blog generation failed", details: err.message }, { status: 500 });
  }
}
