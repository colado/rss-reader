// src/parser/parseFeed.ts
import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";

/** Public types */
export type NormalizedFeed = {
  title?: string;
  site_url?: string;
  feed_url?: string;
  entries: NormalizedEntry[];
};

export type NormalizedEntry = {
  guid: string;
  url?: string;
  title?: string;
  html?: string;
  text?: string;
  published_at?: Date;
  updated_at?: Date;
  content_hash?: string;
};

/**
 * Entry point: parse a raw feed string (RSS/Atom/JSON Feed) and normalize.
 * @param raw        the raw HTTP response body (string)
 * @param fetchUrl   the URL we fetched (used to resolve relative links)
 */
export function parseFeed(raw: string, fetchUrl: string): NormalizedFeed {
  const trimmed = raw.trim();

  // JSON Feed check: starts with { and has "items"
  if (trimmed.startsWith("{")) {
    try {
      const obj = JSON.parse(trimmed);
      if (obj && (obj.items || obj.version?.includes("jsonfeed"))) {
        return normalizeJsonFeed(obj, fetchUrl);
      }
    } catch {
      // fall through to XML
    }
  }

  // XML (RSS/Atom)
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    // Be tolerant; do not transform tags automatically
  });

  const xml: any = parser.parse(trimmed);

  // Heuristics: RSS 2.0 has <rss><channel>..., Atom has <feed xmlns="http://www.w3.org/2005/Atom">
  if (xml && xml.rss && xml.rss.channel) {
    return normalizeRss2(xml.rss.channel, fetchUrl);
  }
  if (xml && xml.feed) {
    return normalizeAtom(xml.feed, fetchUrl);
  }

  // Unknown format — return empty
  return { entries: [] };
}

/* --------------------------- Normalizers --------------------------- */

function normalizeRss2(channel: any, fetchUrl: string): NormalizedFeed {
  const base = baseUrl(fetchUrl);
  const site_url = firstString(channel.link);
  const title = firstString(channel.title);

  const items = asArray(channel.item);
  const entries: NormalizedEntry[] = items.map((it: any) => {
    // GUID can be <guid isPermaLink="false">abc</guid>, or absent → fallback to link/title/date hash
    const guid =
      firstString(it.guid) ||
      stableHash(`${firstString(it.link) || ""}|${firstString(it.title) || ""}|${firstString(it.pubDate) || ""}`);

    const url = resolveUrl(firstString(it.link), base);
    const title_ = firstString(it.title);
    // Prefer content:encoded if present, else description
    const html = firstString(it["content:encoded"]) ?? firstString(it.description);
    const text = undefined; // you can add a HTML→text fallback later

    const published_at = parseDate(firstString(it.pubDate));
    const updated_at = published_at;

    return withHash({
      guid,
      url,
      title: title_,
      html,
      text,
      published_at,
      updated_at,
    });
  });

  return { title, site_url, feed_url: fetchUrl, entries };
}

function normalizeAtom(feed: any, fetchUrl: string): NormalizedFeed {
  const base = baseUrl(fetchUrl);
  const title = firstString(feed.title);
  const site_url = pickAtomLink(feed, "alternate") ?? pickAtomLink(feed, "self") ?? base;

  const entries: NormalizedEntry[] = asArray(feed.entry).map((e: any) => {
    // Atom ID is typically stable
    const guid = firstString(e.id) || stableHash(JSON.stringify(e));
    const url = pickAtomLink(e, "alternate") ?? pickAtomLink(e, undefined) ?? base;

    const title_ = firstString(e.title);

    // Atom content may be in <content> or <summary>, can be text/html
    const html =
      pickAtomContent(e.content) ??
      pickAtomContent(e.summary) ??
      undefined;

    const published_at = parseDate(firstString(e.published) || firstString(e.updated));
    const updated_at = parseDate(firstString(e.updated) || firstString(e.published));

    return withHash({
      guid,
      url: resolveUrl(url, base),
      title: title_,
      html,
      text: undefined,
      published_at,
      updated_at,
    });
  });

  return { title, site_url, feed_url: fetchUrl, entries };
}

function normalizeJsonFeed(obj: any, fetchUrl: string): NormalizedFeed {
  const base = baseUrl(fetchUrl);
  const site_url = firstString(obj.home_page_url) ?? base;
  const title = firstString(obj.title);
  const entries: NormalizedEntry[] = asArray(obj.items).map((it: any) => {
    const guid = firstString(it.id) || stableHash(JSON.stringify(it));
    const url = resolveUrl(firstString(it.url) ?? firstString(it.external_url), base);
    const title_ = firstString(it.title);
    const html = firstString(it.content_html) ?? undefined;
    const text = html ? undefined : firstString(it.content_text) ?? undefined;
    const published_at = parseDate(firstString(it.date_published));
    const updated_at = parseDate(firstString(it.date_modified) || firstString(it.date_published));

    return withHash({
      guid,
      url,
      title: title_ ?? undefined,
      html,
      text,
      published_at,
      updated_at,
    });
  });

  return { title, site_url, feed_url: fetchUrl, entries };
}

/* --------------------------- Helpers --------------------------- */

function firstString(v: any): string | undefined {
  if (v == null) return undefined;
  if (typeof v === "string") return v.trim() || undefined;
  // Some XML libs return objects like { "#text": "..." }
  if (typeof v === "object" && typeof v["#text"] === "string") return v["#text"].trim() || undefined;
  return undefined;
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function parseDate(s?: string): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return isNaN(+d) ? undefined : d;
}

function baseUrl(fetchUrl: string): string {
  try {
    const u = new URL(fetchUrl);
    u.pathname = "/";
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return fetchUrl;
  }
}

function resolveUrl(url: string | undefined, base: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
}

function stableHash(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 32); // short-ish but stable
}

function withHash(e: Omit<NormalizedEntry, "content_hash">): NormalizedEntry {
  // Hash over the fields most indicative of identity/content
  const basis = `${e.url ?? ""}|${e.title ?? ""}|${e.html ?? e.text ?? ""}|${e.published_at?.toISOString() ?? ""}`;
  return { ...e, content_hash: stableHash(basis) };
}

function pickAtomLink(node: any, rel?: string): string | undefined {
  const links = asArray(node.link);
  if (!links.length) return undefined;
  if (rel) {
    const found = links.find((l: any) => (l.rel || "").toLowerCase() === rel.toLowerCase());
    if (found?.href) return firstString(found.href);
  }
  // fallback: first link with href
  for (const l of links) {
    if (l?.href) return firstString(l.href);
  }
  return undefined;
}

function pickAtomContent(c: any): string | undefined {
  if (!c) return undefined;
  // Atom can encode HTML as <content type="html"> or xhtml; fast-xml-parser keeps objects/attrs
  if (typeof c === "string") return c;
  if (typeof c === "object") {
    if (typeof c["#text"] === "string") return c["#text"];
    if (typeof c.__cdata === "string") return c.__cdata; // if CDATA preserved
    if (typeof c._text === "string") return c._text;
  }
  return undefined;
}
