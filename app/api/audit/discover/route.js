import * as cheerio from "cheerio";

export const maxDuration = 120;

const MAX_PAGES = 75; // generous ceiling for condition/service-page-heavy clinic sites

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

// Blog/non-service content we don't want cluttering a service-page audit.
function isBlogLikeUrl(u) {
  return /\/(blog|news|category|tag|tags|author)\//i.test(u) || /\/20\d\d\/\d\d?\//.test(u);
}

async function parseSitemapUrls(sitemapUrl, depth = 0) {
  if (depth > 1) return [];
  const sm = await safeFetch(sitemapUrl);
  if (!sm.ok) return [];
  const $ = cheerio.load(sm.text, { xmlMode: true });
  if (sm.text.includes("<sitemapindex")) {
    const children = $("sitemap > loc").map((i, el) => $(el).text().trim()).get();
    const all = [];
    for (const child of children.slice(0, 15)) {
      all.push(...(await parseSitemapUrls(child, depth + 1)));
      if (all.length >= MAX_PAGES) break;
    }
    return all;
  }
  return $("loc").map((i, el) => $(el).text().trim()).get().filter(Boolean);
}

async function findSitemapUrls(origin) {
  // Standard convention: robots.txt often declares the real sitemap path.
  const robots = await safeFetch(`${origin}/robots.txt`);
  const declared = [];
  if (robots.ok) {
    const matches = robots.text.matchAll(/^\s*sitemap:\s*(\S+)/gim);
    for (const m of matches) declared.push(m[1].trim());
  }

  const candidates = [
    ...declared,
    `${origin}/sitemap_index.xml`,
    `${origin}/sitemap.xml`,
    `${origin}/wp-sitemap.xml`,
  ];

  for (const candidate of candidates) {
    const urls = await parseSitemapUrls(candidate);
    if (urls.length) return { urls, source: candidate.replace(origin, "") };
  }
  return { urls: [], source: null };
}

// Depth-2 crawl: homepage links, then also follow links found on THOSE pages
// (e.g. homepage -> "Services" hub -> individual service/condition pages),
// since many clinic sites nest service pages a level deeper than the homepage.
async function crawlByDepth(homepageHtml, homepageUrl, host) {
  const found = new Set([homepageUrl]);
  const extractLinks = (html, baseUrl) => {
    const $ = cheerio.load(html);
    const links = new Set();
    $("a[href]").each((i, el) => {
      const href = $(el).attr("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      try {
        const abs = new URL(href, baseUrl);
        abs.hash = "";
        abs.search = "";
        if (abs.hostname === host && !isBlogLikeUrl(abs.toString())) links.add(abs.toString());
      } catch {}
    });
    return links;
  };

  const level1 = extractLinks(homepageHtml, homepageUrl);
  level1.forEach((l) => found.add(l));

  // Fetch a reasonable sample of level-1 pages to discover level-2 (nested) pages.
  const toExpand = [...level1].slice(0, 20);
  const level2Results = await Promise.all(
    toExpand.map(async (pageUrl) => {
      if (found.size >= MAX_PAGES) return [];
      const page = await safeFetch(pageUrl);
      if (!page.ok) return [];
      return [...extractLinks(page.text, pageUrl)];
    })
  );
  level2Results.flat().forEach((l) => {
    if (found.size < MAX_PAGES) found.add(l);
  });

  return [...found].filter((u) => !isBlogLikeUrl(u));
}

export async function POST(req) {
  try {
    const { url: rawUrl } = await req.json();
    if (!rawUrl) return Response.json({ error: "No URL provided" }, { status: 400 });

    let url = rawUrl.trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;

    const homepage = await safeFetch(url);
    if (!homepage.ok) {
      return Response.json({ error: `Couldn't fetch that URL (status: ${homepage.status || "unreachable"})` }, { status: 400 });
    }

    const finalUrl = homepage.finalUrl || url;
    const parsedUrl = new URL(finalUrl);
    const origin = `${parsedUrl.protocol}//${parsedUrl.host}`;

    // Prefer sitemaps (properly discovered via robots.txt + common paths,
    // with sitemap-index support for large WordPress sites).
    const { urls: sitemapUrls, source } = await findSitemapUrls(origin);
    if (sitemapUrls.length) {
      const filtered = sitemapUrls.filter((u) => !isBlogLikeUrl(u)).slice(0, MAX_PAGES);
      return Response.json({ pages: filtered, source: `sitemap (${source})`, startUrl: finalUrl });
    }

    // Fallback: depth-2 crawl (homepage links, then links found on those
    // pages too), so nested service/condition pages under a hub page like
    // "/services" still get discovered.
    const host = parsedUrl.hostname;
    const crawled = await crawlByDepth(homepage.text, finalUrl, host);
    return Response.json({
      pages: crawled.slice(0, MAX_PAGES),
      source: "site crawl, depth 2 (no sitemap found)",
      startUrl: finalUrl,
    });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Discovery failed", details: err.message }, { status: 500 });
  }
}
