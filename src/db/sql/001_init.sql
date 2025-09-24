CREATE TABLE IF NOT EXISTS feeds (
  id BIGSERIAL PRIMARY KEY,
  feed_url TEXT UNIQUE NOT NULL,         -- canonical URL of the RSS/Atom/JSON feed
  site_url TEXT,                         -- publisher's website (optional, parsed later)
  title TEXT,                            -- human-readable name (optional, parsed later)
  etag TEXT,                             -- from server, for conditional GET
  last_modified TEXT,                    -- from server, for conditional GET
  last_polled_at TIMESTAMPTZ,            -- last tried to fetch
  last_changed_at TIMESTAMPTZ,           -- last SAW content change
  error_streak INT NOT NULL DEFAULT 0,   -- consecutive failures
  next_poll_at TIMESTAMPTZ NOT NULL DEFAULT NOW() -- when to try next
);

CREATE TABLE IF NOT EXISTS entries (
  id BIGSERIAL PRIMARY KEY,
  feed_id BIGINT REFERENCES feeds(id) ON DELETE CASCADE,
  guid TEXT,                    -- publisher-provided identifier (not always reliable)
  url TEXT,
  title TEXT,
  html TEXT,                    -- sanitized HTML body (later)
  text TEXT,                    -- plain text (later)
  published_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  content_hash TEXT,            -- dedupe helper
  UNIQUE(feed_id, guid)         -- makes ingest idempotent WHEN guid is present
);
