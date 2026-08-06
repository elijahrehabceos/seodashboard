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
  // Real shortcodes/template artifacts follow predictable patterns. Deliberately
  // conservative to avoid flagging normal text: square-bracket shortcodes
  // require a lowercase WordPress-style tag name (excludes "[Read More]",
  // "[1]" citations, Cloudflare's "[email protected]"); parenthesis patterns
  // require a snake_case function-call shape (excludes normal English
  // parentheticals like phone numbers or asides).
  const patterns = [
    /\[\/?[a-z][a-z0-9_-]{2,}(?:\s+[a-z_-]+=(?:"[^"]*"|'[^']*'))*\s*\/?\]/g, // [shortcode foo="bar"]
    /\{\{[a-z_][a-z0-9_.]*\}\}/gi, // {{template_var}}
    /\{[a-z_][a-z0-9_.]*\}/gi, // {first_name} — single-brace placeholder
    /\b[a-z][a-z0-9]*_[a-z0-9_]*\([^()]*\)/g, // snake_case_function(args) — leftover function calls
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

// Social platforms use aggressive bot detection (TLS fingerprinting, JS
// challenges) that blocks simple automated requests even when the actual
// page is completely fine — no realistic User-Agent header gets around
// this. Rather than falsely flag these as broken, we just don't check them.
const SKIP_LINK_CHECK_DOMAINS = [
  "facebook.com", "instagram.com", "linkedin.com", "twitter.com", "x.com",
  "tiktok.com", "pinterest.com", "youtube.com",
];

function shouldSkipLinkCheck(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return SKIP_LINK_CHECK_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

async function checkLinks($, pageUrl) {
  const host = new URL(pageUrl).hostname;
  const links = new Set();
  $("a[href]").each((i, el) => {
    const href = $(el).attr("href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) return;
    if (shouldSkipLinkCheck(href)) return; // social platforms — can't reliably check, so don't flag
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

    // Known real terms LanguageTool's generic dictionary doesn't recognize
    // (physical therapy / medical vocabulary). This list will need to grow
    // over time — a generic spell-checker can't know every specialized term.
    const KNOWN_TERMS = new Set([
      "myofascia", "myofascial", "proprioception", "proprioceptive", "kinesiology",
      "subluxation", "dorsiflexion", "plantarflexion", "tenosynovitis", "osteoarthritis",
      "rehabilitative", "biomechanics", "orthotics",
    ]);

    const isRepeatedWordRule = (m) => /repeated a word|word repeat/i.test(m.message || "");
    const isSpellingCategory = (m) => m.rule?.category?.id === "TYPOS";
    const flaggedWord = (m) => (m.context?.text || "").substr(m.context?.offset ?? 0, m.context?.length ?? 0);
    const looksLikeProperNounOrAcronym = (word) => /^[A-Z]/.test(word) || /^[A-Z]{2,}$/.test(word);
    const isKnownTerm = (word) => KNOWN_TERMS.has(word.toLowerCase());
    // A "merged words" issue (e.g. "pmFriday") isn't a misspelling — both
    // halves are spelled correctly, they're just missing a space. The
    // suggested fix in these cases is just the same letters with a space
    // added back in, which is how we can tell the two apart from a real typo.
    const isJustMissingSpace = (m) => {
      const word = flaggedWord(m);
      const suggestion = m.replacements?.[0]?.value || "";
      return suggestion.replace(/\s+/g, "").toLowerCase() === word.replace(/\s+/g, "").toLowerCase() && suggestion.includes(" ");
    };

    const relevant = matches
      .filter((m) => isRepeatedWordRule(m) || isSpellingCategory(m))
      .filter((m) => isRepeatedWordRule(m) || !looksLikeProperNounOrAcronym(flaggedWord(m)))
      .filter((m) => isRepeatedWordRule(m) || !isKnownTerm(flaggedWord(m)))
      .filter((m) => !isJustMissingSpace(m))
      .slice(0, 12);
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
