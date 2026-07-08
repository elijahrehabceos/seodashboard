import * as cheerio from "cheerio";

export const maxDuration = 60;

const MAX_PAGES = 75; // generous ceiling for condition/service-page-heavy clinic sites

async function safeFetch(url, opts = {}) {
  try {
    const res = await fetch(url, { redirect: "follow", ...opts });
    const text = opts.method === "HEAD" ? "" : await res.text();
    return { ok: res.ok, status: res.status, finalUrl: res.url, text };
  } catch (err) {
    return { ok: false, status: null, finalUrl: url, text: "", error: err.message };
  }
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

    // Prefer sitemap.xml — also follows sitemap INDEX files (a sitemap of
    // sitemaps), common on WordPress sites with lots of pages.
    const sitemap = await safeFetch(`${origin}/sitemap.xml`);
    if (sitemap.ok && sitemap.text.includes("<sitemapindex")) {
      const $index = cheerio.load(sitemap.text, { xmlMode: true });
      const childSitemaps = $index("sitemap > loc").map((i, el) => $index(el).text().trim()).get();
      const allUrls = [];
      for (const childUrl of childSitemaps.slice(0, 10)) {
        const child = await safeFetch(childUrl);
        if (child.ok) {
          const $child = cheerio.load(child.text, { xmlMode: true });
          allUrls.push(...$child("loc").map((i, el) => $child(el).text().trim()).get());
        }
        if (allUrls.length >= MAX_PAGES) break;
      }
      if (allUrls.length) {
        return Response.json({ pages: allUrls.slice(0, MAX_PAGES), source: "sitemap index", startUrl: finalUrl });
      }
    }
    if (sitemap.ok && sitemap.text.includes("<loc>")) {
      const $ = cheerio.load(sitemap.text, { xmlMode: true });
      const urls = $("loc").map((i, el) => $(el).text().trim()).get().filter(Boolean);
      if (urls.length) {
        return Response.json({ pages: urls.slice(0, MAX_PAGES), source: "sitemap.xml", startUrl: finalUrl });
      }
    }

    // Fallback: crawl internal links found on the homepage.
    const $ = cheerio.load(homepage.text);
    const host = parsedUrl.hostname;
    const found = new Set([finalUrl]);
    $("a[href]").each((i, el) => {
      if (found.size >= MAX_PAGES) return;
      const href = $(el).attr("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      try {
        const abs = new URL(href, finalUrl);
        abs.hash = "";
        if (abs.hostname === host) found.add(abs.toString());
      } catch {}
    });

    return Response.json({ pages: [...found].slice(0, MAX_PAGES), source: "homepage links (no sitemap found)", startUrl: finalUrl });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Discovery failed", details: err.message }, { status: 500 });
  }
}
