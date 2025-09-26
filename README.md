# RSS Reader (Backend Learning Project)

A small backend project to learn Node.js + PostgreSQL by building an RSS/Atom feed aggregator.

## How it works
- **Scheduler**: checks the database for feeds that are due (`next_poll_at`) and triggers ingestion.
- **Fetcher/Parser**: politely fetches feeds, parses XML/JSON into entries.
- **Database**: stores feeds and entries, prevents duplicates, and schedules the next poll.

## Setup
1. Install deps: `npm install`
2. Create DB: `createdb rss`
3. Configure `.env` with `DATABASE_URL=postgres://user:pass@127.0.0.1:5432/rss`
4. Run migrations + seed:  
   ```bash
   npm run migrate
   npm run seed
