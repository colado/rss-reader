export async function politeFetch(
  url: string,
  opts?: { etag?: string; lastModified?: string; timeoutMs?: number }
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 10000);

  const headers = new Headers({
    "User-Agent": "SergiosRSS/0.1 (+https://github.com/sergiocolado/rss-reader; contact: sergio@example.com)",
    "Accept":
      "application/rss+xml, application/atom+xml, application/xml, text/xml, application/feed+json;q=0.9, */*;q=0.1",
  });
  if (opts?.etag) headers.set("If-None-Match", opts.etag);
  if (opts?.lastModified) headers.set("If-Modified-Since", opts.lastModified);

  const res = await fetch(url, {
    method: "GET",
    headers,
    redirect: "follow",
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));

  if (res.status === 304) return { kind: "not-modified" as const, status: 304 };

  if (!res.ok && (res.status < 300 || res.status >= 400)) {
    throw new Error(`HTTP ${res.status}`);
  }

  const ct = res.headers.get("content-type") ?? "";
  const charset = /charset=([^;]+)/i.exec(ct)?.[1]?.trim().toLowerCase();
  const buf = Buffer.from(await res.arrayBuffer());
  const body =
    charset && charset !== "utf-8" && charset !== "utf8"
      ? (await import("iconv-lite")).default.decode(buf, charset)
      : buf.toString("utf8");

  return {
    kind: "ok" as const,
    status: res.status,
    body,
    etag: res.headers.get("etag") ?? undefined,
    lastModified: res.headers.get("last-modified") ?? undefined,
    finalUrl: res.url,
  };
}
