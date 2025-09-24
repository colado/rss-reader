// src/fetch/withLimit.ts
import { HostLimiter } from "./hostLimiter";
import { politeFetch } from "./politeFetcher";

const limiter = new HostLimiter(3); // shared per process

export async function fetchWithLimit(
  feedUrl: string,
  opts?: { etag?: string; lastModified?: string }
) {
  // SAFER: use WHATWG URL to extract the hostname
  let host = "unknown";
  try { host = new URL(feedUrl).hostname || "unknown"; } catch {}
  return limiter.withHostLimit(host, () => politeFetch(feedUrl, opts));
}
