import { client } from "../db/client";
import { fetchAndIngestOnce } from "../ingest";

export async function runScheduler() {
  while (true) {
    const { rows } = await client.query(
      `SELECT * FROM feeds
       WHERE next_poll_at <= NOW()
       ORDER BY next_poll_at ASC
       LIMIT 20`
    );

    if (rows.length === 0) {
      await sleep(2000);
      continue;
    }

    // Fire a small batch in parallel
    await Promise.all(
      rows.map((feed) => fetchAndIngestOnce(feed.id, client))
    );
  }
}

function sleep(ms: number) { return new Promise(res => setTimeout(res, ms)); }
