import * as cheerio from "cheerio";

export const maxDuration = 60;

const MAX_LINKS_CHECKED_PER_PAGE = 20;

async function safeFetch(url, opts = {}) {
  try {
    const res = await fetch(url, { redirect: "follow", ...opts });
    const text = opts.method === "HEAD" ? "" : await res.text();
    return { ok: res.ok, status: res.status, finalUrl: res.url, text };
  } catch (err) {
    return { ok: false, status: null, finalUrl: url, text: "", error: err.message };
  }
}

function runTechnicalChecks(url, html) {
  const $ = cheerio.load(html);
  const checks = [];

  const title = $("title").first().text().trim();
  checks.push({
    id: "title",
    label: "Title tag",
    detail: title ? `"${title}" (${title.length} chars)` : "Missing entirely",
    severity: !title ? "critical" : title.length > 60 ? "warning" : "pass",
  });

  const metaDesc = $('meta[name="description"]').attr("content") || "";
  checks.push({
    id: "meta_description",
    label: "Meta description",
    detail: metaDesc ? `${metaDesc.length} chars` : "Missing entirely",
    severity: !metaDesc ? "critical" : metaDesc.length > 160 ? "warning" : "pass",
  });

  const h1s = $("h1");
  checks.push({
    id: "h1",
    label: "H1 heading",
    detail:
      h1s.length === 0
        ? "No H1 found"
        : h1s.length === 1
        ? `"${$(h1s[0]).text().trim()}"`
        : `${h1s.length} H1 tags found (should be 1)`,
    severity: h1s.length === 0 ? "critical" : h1s.length > 1 ? "warning" : "pass",
  });

  const viewport = $('meta[name="viewport"]').attr("content");
  checks.push({
    id: "viewport",
    label: "Mobile viewport tag",
    detail: viewport || "Missing — page may not be mobile-optimized",
    severity: viewport ? "pass" : "critical",
  });

  const schemaBlocks = $('script[type="application/ld+json"]');
  checks.push({
    id: "schema",
    label: "Structured data (schema.org)",
    detail: schemaBlocks.length > 0 ? `${schemaBlocks.length} JSON-LD block(s) found` : "No schema markup found",
    severity: schemaBlocks.length > 0 ? "pass" : "warning",
  });

  const images = $("img");
  const missingAlt = images.filter((i, el) => !$(el).attr("alt")?.trim()).length;
  checks.push({
    id: "alt_text",
    label: "Image alt text",
    detail: `${missingAlt} of ${images.length} images missing alt text`,
    severity: missingAlt === 0 ? "pass" : missingAlt / Math.max(images.length, 1) > 0.5 ? "critical" : "warning",
  });

  checks.push({
    id: "https",
    label: "HTTPS",
    detail: url.startsWith("https://") ? "Served over HTTPS" : "NOT using HTTPS",
    severity: url.startsWith("https://") ? "pass" : "critical",
  });

  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const wordCount = bodyText.split(" ").filter(Boolean).length;
  checks.push({
    id: "word_count",
    label: "Page content length",
    detail: `~${wordCount} words`,
    severity: wordCount < 150 ? "critical" : wordCount < 300 ? "warning" : "pass",
  });

  return { checks, bodyText, $ };
}

function findShortcodeArtifacts(bodyText) {
  const patterns = [
    /\[[a-zA-Z][a-zA-Z0-9_\-]*(?:\s[^\[\]]*)?\]/g,
    /\{\{[^{}]+\}\}/g,
    /<\?php.*?\?>/gs,
    /%[A-Z_]+%/g,
  ];
  const found = new Set();
  for (const re of patterns) {
    const matches = bodyText.match(re) || [];
    matches.forEach((m) => found.add(m.trim()));
  }
  return [...found].slice(0, 15);
}

async function checkLinks($, pageUrl) {
  const host = new URL(pageUrl).hostname;
  const links = new Set();
  $("a[href]").each((i, el) => {
    const href = $(el).attr("href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) return;
    try {
      const abs = new URL(href, pageUrl);
      abs.hash = "";
      links.add(abs.toString());
    } catch {}
  });

  const linkList = [...links].slice(0, MAX_LINKS_CHECKED_PER_PAGE);
  const results = await Promise.all(
    linkList.map(async (link) => {
      const res = await safeFetch(link, { method: "HEAD" });
      if (!res.ok && (res.status === 405 || res.status === null)) {
        const retry = await safeFetch(link, { method: "GET" });
        return { url: link, status: retry.status, ok: retry.ok };
      }
      return { url: link, status: res.status, ok: res.ok };
    })
  );

  return results.filter((r) => !r.ok);
}

async function reviewContentWithClaude(apiKey, pageUrl, bodyText) {
  if (!apiKey) return null;
  const sample = bodyText.slice(0, 3000);
  const prompt = `You're proofreading the visible text content of a physical
therapy / wellness clinic's website page (${pageUrl}) for a front-end content
audit. Here's the extracted visible text:

"""
${sample}
"""

Check for: spelling errors, obvious typos, duplicated words/sentences,
awkward or broken phrasing, and placeholder text that looks like it was
never replaced (e.g. "Lorem ipsum", "Your Business Name Here", "Insert text").
List specific issues found, quoting the exact problem text, with a fix
suggestion for each. If nothing is wrong, just say "No content issues found."
Plain text, no markdown, no em dashes. Keep it to the actual issues, don't
pad with commentary.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const json = await res.json();
    return json?.content?.find((b) => b.type === "text")?.text?.trim() || null;
  } catch {
    return null;
  }
}

export async function POST(req) {
  try {
    const { url: pageUrl } = await req.json();
    if (!pageUrl) return Response.json({ error: "No URL provided" }, { status: 400 });

    const page = await safeFetch(pageUrl);
    if (!page.ok) {
      return Response.json({ url: pageUrl, error: `Couldn't fetch (status ${page.status || "unreachable"})` });
    }

    const { checks, bodyText, $ } = runTechnicalChecks(page.finalUrl || pageUrl, page.text);
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const [brokenLinks, contentIssues] = await Promise.all([
      checkLinks($, page.finalUrl || pageUrl),
      reviewContentWithClaude(apiKey, page.finalUrl || pageUrl, bodyText),
    ]);
    const shortcodeArtifacts = findShortcodeArtifacts(bodyText);

    return Response.json({
      url: page.finalUrl || pageUrl,
      checks,
      brokenLinks,
      shortcodeArtifacts,
      contentIssues,
    });
  } catch (err) {
    console.error(err);
    return Response.json({ url: null, error: err.message });
  }
}
