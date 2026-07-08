import * as cheerio from "cheerio";

export const maxDuration = 60;

async function safeFetch(url, opts = {}) {
  try {
    const res = await fetch(url, { redirect: "follow", ...opts });
    const text = await res.text();
    return { ok: res.ok, status: res.status, finalUrl: res.url, text };
  } catch (err) {
    return { ok: false, status: null, finalUrl: url, text: "", error: err.message };
  }
}

function runChecks(url, html, robots, sitemap) {
  const $ = cheerio.load(html);
  const checks = [];

  // Title
  const title = $("title").first().text().trim();
  checks.push({
    id: "title",
    label: "Title tag",
    pass: title.length > 0 && title.length <= 60,
    detail: title ? `"${title}" (${title.length} chars)` : "Missing entirely",
    severity: !title ? "critical" : title.length > 60 ? "warning" : "pass",
  });

  // Meta description
  const metaDesc = $('meta[name="description"]').attr("content") || "";
  checks.push({
    id: "meta_description",
    label: "Meta description",
    pass: metaDesc.length > 0 && metaDesc.length <= 160,
    detail: metaDesc ? `${metaDesc.length} chars` : "Missing entirely",
    severity: !metaDesc ? "critical" : metaDesc.length > 160 ? "warning" : "pass",
  });

  // H1
  const h1s = $("h1");
  checks.push({
    id: "h1",
    label: "H1 heading",
    pass: h1s.length === 1,
    detail: h1s.length === 0 ? "No H1 found" : h1s.length === 1 ? `"${$(h1s[0]).text().trim()}"` : `${h1s.length} H1 tags found (should be 1)`,
    severity: h1s.length === 0 ? "critical" : h1s.length > 1 ? "warning" : "pass",
  });

  // Viewport (mobile-friendliness signal)
  const viewport = $('meta[name="viewport"]').attr("content");
  checks.push({
    id: "viewport",
    label: "Mobile viewport tag",
    pass: !!viewport,
    detail: viewport || "Missing — page may not be mobile-optimized",
    severity: viewport ? "pass" : "critical",
  });

  // Canonical
  const canonical = $('link[rel="canonical"]').attr("href");
  checks.push({
    id: "canonical",
    label: "Canonical tag",
    pass: !!canonical,
    detail: canonical || "Missing",
    severity: canonical ? "pass" : "warning",
  });

  // Schema markup
  const schemaBlocks = $('script[type="application/ld+json"]');
  checks.push({
    id: "schema",
    label: "Structured data (schema.org)",
    pass: schemaBlocks.length > 0,
    detail: schemaBlocks.length > 0 ? `${schemaBlocks.length} JSON-LD block(s) found` : "No schema markup found",
    severity: schemaBlocks.length > 0 ? "pass" : "warning",
  });

  // Image alt text
  const images = $("img");
  const missingAlt = images.filter((i, el) => !$(el).attr("alt")?.trim()).length;
  checks.push({
    id: "alt_text",
    label: "Image alt text",
    pass: images.length === 0 || missingAlt === 0,
    detail: `${missingAlt} of ${images.length} images missing alt text`,
    severity: missingAlt === 0 ? "pass" : missingAlt / Math.max(images.length, 1) > 0.5 ? "critical" : "warning",
  });

  // HTTPS
  checks.push({
    id: "https",
    label: "HTTPS",
    pass: url.startsWith("https://"),
    detail: url.startsWith("https://") ? "Site is served over HTTPS" : "Site is NOT using HTTPS",
    severity: url.startsWith("https://") ? "pass" : "critical",
  });

  // robots.txt
  checks.push({
    id: "robots",
    label: "robots.txt",
    pass: robots.ok,
    detail: robots.ok
      ? robots.text.toLowerCase().includes("disallow: /") && !robots.text.toLowerCase().includes("disallow: /$")
        ? "Found, but check for accidental blanket 'Disallow: /' rules"
        : "Found and looks reasonable"
      : "Not found (returns non-200)",
    severity: !robots.ok ? "warning" : robots.text.toLowerCase().includes("disallow: /\n") ? "critical" : "pass",
  });

  // sitemap.xml
  checks.push({
    id: "sitemap",
    label: "sitemap.xml",
    pass: sitemap.ok,
    detail: sitemap.ok ? "Found" : "Not found at /sitemap.xml",
    severity: sitemap.ok ? "pass" : "warning",
  });

  // Word count (thin content signal)
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const wordCount = bodyText.split(" ").filter(Boolean).length;
  checks.push({
    id: "word_count",
    label: "Page content length",
    pass: wordCount >= 300,
    detail: `~${wordCount} words`,
    severity: wordCount < 150 ? "critical" : wordCount < 300 ? "warning" : "pass",
  });

  // Internal links
  const links = $("a[href]");
  let internalCount = 0;
  const host = new URL(url).hostname;
  links.each((i, el) => {
    const href = $(el).attr("href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
    try {
      const abs = new URL(href, url);
      if (abs.hostname === host) internalCount++;
    } catch {}
  });
  checks.push({
    id: "internal_links",
    label: "Internal linking",
    pass: internalCount >= 3,
    detail: `${internalCount} internal links found on this page`,
    severity: internalCount < 3 ? "warning" : "pass",
  });

  return { checks, title, metaDesc, wordCount };
}

export async function POST(req) {
  try {
    const { url: rawUrl } = await req.json();
    if (!rawUrl) return Response.json({ error: "No URL provided" }, { status: 400 });

    let url = rawUrl.trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;

    const page = await safeFetch(url);
    if (!page.ok) {
      return Response.json({ error: `Couldn't fetch that URL (status: ${page.status || "unreachable"})` }, { status: 400 });
    }

    const parsedUrl = new URL(page.finalUrl || url);
    const origin = `${parsedUrl.protocol}//${parsedUrl.host}`;
    const [robots, sitemap] = await Promise.all([
      safeFetch(`${origin}/robots.txt`),
      safeFetch(`${origin}/sitemap.xml`),
    ]);

    const { checks, title, metaDesc, wordCount } = runChecks(page.finalUrl || url, page.text, robots, sitemap);

    const critical = checks.filter((c) => c.severity === "critical");
    const warnings = checks.filter((c) => c.severity === "warning");
    const passed = checks.filter((c) => c.severity === "pass");

    // Claude synthesis: prioritized narrative + specific fixes
    const apiKey = process.env.ANTHROPIC_API_KEY;
    let narrative = "";
    if (apiKey) {
      const prompt = `You are a senior technical SEO auditor. You just ran an automated
scan of ${url} and found this:

Title: ${title || "MISSING"}
Meta description: ${metaDesc || "MISSING"}
Checks: ${JSON.stringify(checks.map((c) => ({ label: c.label, severity: c.severity, detail: c.detail })))}

Write a short (4-6 sentence) executive summary for an agency team member,
prioritizing the most important fixes first, specific and actionable, plain
confident tone, no markdown, no em dashes. Physical therapy / wellness
clinic client context.`;
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
            max_tokens: 400,
            messages: [{ role: "user", content: prompt }],
          }),
        });
        const json = await res.json();
        narrative = json?.content?.find((b) => b.type === "text")?.text?.trim() || "";
      } catch {
        narrative = "";
      }
    }

    return Response.json({
      url: page.finalUrl || url,
      checks,
      counts: { critical: critical.length, warning: warnings.length, pass: passed.length },
      narrative,
      wordCount,
    });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Audit failed", details: err.message }, { status: 500 });
  }
}
