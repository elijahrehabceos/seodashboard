import * as cheerio from "cheerio";

export const maxDuration = 60;

const MAX_LINKS_CHECKED_PER_PAGE = 20;

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function safeFetch(url, opts = {}) {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": BROWSER_UA, ...(opts.headers || {}) },
      ...opts,
    });
    const text = opts.method === "HEAD" ? "" : await res.text();
    return { ok: res.ok, status: res.status, finalUrl: res.url, text };
  } catch (err) {
    return { ok: false, status: null, finalUrl: url, text: "", error: err.message };
  }
}

function runTechnicalChecks(url, html) {
  const $ = cheerio.load(html);
  $('script:not([type="application/ld+json"]), style, noscript, template').remove(); // never treat JS/CSS as visible page content
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

  checks.push({
    id: "https",
    label: "HTTPS",
    detail: url.startsWith("https://") ? "Served over HTTPS" : "NOT using HTTPS",
    severity: url.startsWith("https://") ? "pass" : "critical",
  });

  $('script[type="application/ld+json"]').remove(); // now safe to strip — schema count already captured
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
  // Real shortcodes follow WordPress convention: lowercase tag name,
  // optionally with attr="value" pairs or a self-closing slash. This
  // deliberately excludes normal bracketed text like "[Read More]",
  // "[1]" citations, or Cloudflare's "[email protected]" obfuscation,
  // none of which are actually broken shortcodes.
  const patterns = [
    /\[\/?[a-z][a-z0-9_-]{2,}(?:\s+[a-z_-]+=(?:"[^"]*"|'[^']*'))*\s*\/?\]/g,
    /\{\{[a-z_][a-z0-9_.]*\}\}/gi, // unrendered template variables like {{first_name}}
  ];
  const found = new Set();
  for (const re of patterns) {
    const matches = bodyText.match(re) || [];
    matches.forEach((m) => {
      if (!/email\s*protected/i.test(m)) found.add(m.trim());
    });
  }
  return [...found].slice(0, 15);
}

async function checkOneLink(link, attempt = 0) {
  const res = await safeFetch(link, { method: "HEAD" });
  if (res.status === 429 && attempt < 2) {
    await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    return checkOneLink(link, attempt + 1);
  }
  if (!res.ok && (res.status === 405 || res.status === null)) {
    const retry = await safeFetch(link, { method: "GET" });
    if (retry.status === 429 && attempt < 2) {
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      return checkOneLink(link, attempt + 1);
    }
    return { url: link, status: retry.status, ok: retry.ok };
  }
  return { url: link, status: res.status, ok: res.ok };
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

  // Check a few at a time, not all at once — hitting a site with 20
  // simultaneous requests is exactly what triggers its own rate limiter,
  // which we'd otherwise misread as broken links.
  const results = [];
  const LINK_CHECK_CONCURRENCY = 3;
  for (let i = 0; i < linkList.length; i += LINK_CHECK_CONCURRENCY) {
    const batch = linkList.slice(i, i + LINK_CHECK_CONCURRENCY);
    const batchResults = await Promise.all(batch.map((link) => checkOneLink(link)));
    results.push(...batchResults);
  }

  // A 429 that survived retries means the site is rate-limiting us, not that
  // the link is broken — don't report those as broken links at all.
  return results.filter((r) => !r.ok && r.status !== 429);
}

async function reviewContentWithLanguageTool(bodyText) {
  const sample = bodyText.slice(0, 15000); // LanguageTool's free tier caps around 20k chars
  if (!sample.trim()) return null;

  try {
    const params = new URLSearchParams({
      text: sample,
      language: "en-US",
      enabledOnly: "false",
    });
    const res = await fetch("https://api.languagetool.org/v2/check", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });
    if (!res.ok) return null;
    const json = await res.json();
    const matches = json.matches || [];
    if (matches.length === 0) return "No content issues found.";

    // Skip style-only nitpicks; keep real spelling/grammar problems.
    const relevant = matches.filter((m) => m.rule?.issueType !== "style").slice(0, 12);
    if (relevant.length === 0) return "No content issues found.";

    return relevant
      .map((m) => {
        const context = m.context?.text || "";
        const suggestion = m.replacements?.[0]?.value;
        return `"${context.trim()}"${suggestion ? ` — suggested fix: "${suggestion}"` : ""} (${m.message})`;
      })
      .join("\n");
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
    const [brokenLinks, contentIssues] = await Promise.all([
      checkLinks($, page.finalUrl || pageUrl),
      reviewContentWithLanguageTool(bodyText),
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
