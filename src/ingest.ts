import { Client } from "pg";
import { politeFetch } from "./fetch/politeFetcher";
import { HostLimiter } from "./fetch/hostLimiter";
import { URL } from "node:url";
import { parseFeed } from "./parser/parseFeed";
const limiter = new HostLimiter(3);

export async function fetchAndIngestOnce(feedId: number, client: Client) {
  const { rows: [feed] } = await client.query(
    `SELECT * FROM feeds WHERE id = $1`, [feedId]
  );
  if (!feed) return;

  const host = new URL(feed.feed_url).host;

  let changed = false;
  try {
    const res = await limiter.withHostLimit(host, () =>
      politeFetch(feed.feed_url, { etag: feed.etag ?? undefined, lastModified: feed.last_modified ?? undefined })
    );

    if (res.kind === "not-modified") {
      await client.query(
        `UPDATE feeds SET last_polled_at = NOW(), error_streak = 0, next_poll_at = NOW() + INTERVAL '10 minutes' WHERE id = $1`,
        [feed.id]
      );
      return;
    }

    // Parse and upsert entries
    const parsed = parseFeed(res.body, res.finalUrl);
    for (const entry of parsed.entries) {
      await client.query(
        `INSERT INTO entries (feed_id, guid, url, title, html, text, published_at, updated_at, content_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (feed_id, guid) DO NOTHING`, // simple idempotency
        [
          feed.id, entry.guid, entry.url, entry.title, entry.html, entry.text,
          entry.published_at, entry.updated_at, entry.content_hash
        ]
      );
      // If at least one insert happened, mark changed
      // (a more robust version checks rowCount)
      changed = true;
    }

    // Update feed metadata and schedule
    await client.query(
      `UPDATE feeds
       SET etag = $1, last_modified = $2, last_polled_at = NOW(),
           last_changed_at = CASE WHEN $3 THEN NOW() ELSE last_changed_at END,
           error_streak = 0,
           next_poll_at = CASE
             WHEN $3 THEN NOW() + INTERVAL '10 minutes'
             ELSE NOW() + INTERVAL '60 minutes'
           END
       WHERE id = $4`,
      [res.etag ?? null, res.lastModified ?? null, changed, feed.id]
    );

  } catch (err) {
    // Backoff on error
    const newStreak = (feed.error_streak ?? 0) + 1;
    await client.query(
      `UPDATE feeds
       SET last_polled_at = NOW(),
           error_streak = $1,
           next_poll_at = NOW() + make_interval(mins => LEAST(POWER(2, $1)::int * 5, 24*60))
       WHERE id = $2`,
      [newStreak, feed.id]
    );
  }
}
