CREATE SCHEMA IF NOT EXISTS fashionhunt;
CREATE TABLE IF NOT EXISTS fashionhunt.products (
  id TEXT PRIMARY KEY, store TEXT NOT NULL, source_id TEXT NOT NULL, market TEXT NOT NULL,
  snapshot_id TEXT, updated_at TEXT NOT NULL, data TEXT NOT NULL,
  order_seq BIGSERIAL UNIQUE, UNIQUE(store,source_id,market));
CREATE TABLE IF NOT EXISTS fashionhunt.snapshots (
  id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES fashionhunt.products(id),
  captured_at TEXT NOT NULL, hash TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS fashionhunt.states (
  product_id TEXT PRIMARY KEY REFERENCES fashionhunt.products(id), decision TEXT, saved INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS fashionhunt.events (
  seq BIGSERIAL PRIMARY KEY, id TEXT UNIQUE NOT NULL,
  product_id TEXT REFERENCES fashionhunt.products(id), snapshot_id TEXT REFERENCES fashionhunt.snapshots(id),
  kind TEXT NOT NULL, reverses TEXT REFERENCES fashionhunt.events(id), context TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS fashionhunt.import_jobs (
  id TEXT PRIMARY KEY, store TEXT NOT NULL, status TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, total INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0, failed INTEGER NOT NULL DEFAULT 0, message TEXT, source_url TEXT);
CREATE TABLE IF NOT EXISTS fashionhunt.import_sources (
  store TEXT PRIMARY KEY, url TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS fashionhunt.import_catalogs (
  store TEXT NOT NULL, url TEXT NOT NULL, next_page INTEGER NOT NULL,
  scanned_pages INTEGER NOT NULL DEFAULT 0, total_pages INTEGER, total_count INTEGER,
  exhausted INTEGER NOT NULL DEFAULT 0, checked_at TEXT, missing_count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(store,url));
CREATE TABLE IF NOT EXISTS fashionhunt.catalog_pages (
  store TEXT NOT NULL,url TEXT NOT NULL,page INTEGER NOT NULL,signature TEXT NOT NULL,
  missing_count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(store,url,page));
CREATE INDEX IF NOT EXISTS events_product ON fashionhunt.events(product_id,seq);
CREATE INDEX IF NOT EXISTS events_undo ON fashionhunt.events(reverses) WHERE kind='undo';
CREATE INDEX IF NOT EXISTS jobs_status ON fashionhunt.import_jobs(status,created_at);
ALTER TABLE fashionhunt.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE fashionhunt.snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE fashionhunt.states ENABLE ROW LEVEL SECURITY;
ALTER TABLE fashionhunt.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE fashionhunt.import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE fashionhunt.import_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE fashionhunt.import_catalogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE fashionhunt.catalog_pages ENABLE ROW LEVEL SECURITY;
