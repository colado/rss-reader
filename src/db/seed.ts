import { Client } from "pg";

// Later to be imported from OPML files
const seeds = [
  "https://news.ycombinator.com/rss",
  "http://feeds.arstechnica.com/arstechnica/index/",
  "https://www.theverge.com/rss/index.xml",
];

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  for (const url of seeds) {
    await client.query(
      `INSERT INTO feeds (feed_url) VALUES ($1)
       ON CONFLICT (feed_url) DO NOTHING`,
      [url]
    );
    console.log(`Seeded: ${url}`);
  }
  await client.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
