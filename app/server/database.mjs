import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import { DEFAULT_SOURCE_URLS, validateCategoryUrl } from '../../import-sources.mjs';
import {discoveryDay,discoveryClock} from './discovery-clock.mjs';
import {firstCatalogPage} from './catalog-pages.mjs';

export function openDatabase(path) {
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY, store TEXT NOT NULL, source_id TEXT NOT NULL, market TEXT NOT NULL,
      snapshot_id TEXT, updated_at TEXT NOT NULL, data TEXT NOT NULL,
      UNIQUE(store, source_id, market));
    CREATE TABLE IF NOT EXISTS snapshots (
      id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id),
      captured_at TEXT NOT NULL, hash TEXT NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS states (
      product_id TEXT PRIMARY KEY REFERENCES products(id), decision TEXT, saved INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS events (
      seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL,
      product_id TEXT REFERENCES products(id), snapshot_id TEXT REFERENCES snapshots(id),
      kind TEXT NOT NULL, reverses TEXT REFERENCES events(id), context TEXT NOT NULL,
      created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS import_jobs (
      id TEXT PRIMARY KEY, store TEXT NOT NULL, status TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      total INTEGER NOT NULL DEFAULT 0, completed INTEGER NOT NULL DEFAULT 0,
      failed INTEGER NOT NULL DEFAULT 0, message TEXT);
    CREATE INDEX IF NOT EXISTS events_product ON events(product_id,seq);
    CREATE INDEX IF NOT EXISTS events_undo ON events(reverses) WHERE kind='undo';
    CREATE INDEX IF NOT EXISTS jobs_status ON import_jobs(status,created_at);`);
  db.exec(`CREATE TABLE IF NOT EXISTS import_sources (
    store TEXT PRIMARY KEY, url TEXT NOT NULL, updated_at TEXT NOT NULL);`);
  db.exec(`CREATE TABLE IF NOT EXISTS import_catalogs (
    store TEXT NOT NULL, url TEXT NOT NULL, next_page INTEGER NOT NULL,
    scanned_pages INTEGER NOT NULL DEFAULT 0, total_pages INTEGER, total_count INTEGER,
    exhausted INTEGER NOT NULL DEFAULT 0, checked_at TEXT, PRIMARY KEY(store,url));
    CREATE TABLE IF NOT EXISTS catalog_pages (
    store TEXT NOT NULL,url TEXT NOT NULL,page INTEGER NOT NULL,signature TEXT NOT NULL,
    PRIMARY KEY(store,url,page));`);
  if (!db.prepare('PRAGMA table_info(import_jobs)').all().some(column => column.name === 'source_url'))
    db.exec('ALTER TABLE import_jobs ADD COLUMN source_url TEXT');
  for(const table of ['import_catalogs','catalog_pages'])
    if(!db.prepare(`PRAGMA table_info(${table})`).all().some(c=>c.name==='missing_count'))db.exec(`ALTER TABLE ${table} ADD COLUMN missing_count INTEGER NOT NULL DEFAULT 0`);
  for (const [shop,url] of Object.entries(DEFAULT_SOURCE_URLS))
    db.prepare('INSERT OR IGNORE INTO import_sources VALUES(?,?,?)').run(shop,url,new Date().toISOString());
  const transaction = fn => {
    db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  function upsert(store, raw, market = store === 'zalando' ? 'SE' : 'GB') {
    if (!['zalando','asos'].includes(store) || !raw.id || !raw.name || !raw.brand || !raw.image || !Number.isFinite(raw.price))
      throw new Error('Produkten saknar obligatoriska fält.');
    const expected = store === 'zalando' ? 'www.zalando.se' : 'www.asos.com';
    const url = new URL(raw.url);
    if (url.protocol !== 'https:' || url.hostname !== expected) throw new Error('Ogiltig butikslänk.');
    // Only extract the gallery of this product, never recommendation images.
    const images = [...new Set([raw.image, ...(raw.details?.images ?? []), ...(raw.images ?? [])])]
      .filter(u => typeof u === 'string' && /^https:\/\//.test(u) && !/\.m3u8/.test(u)).slice(0,20);
    const detail = raw.details ?? {};
    const record = { ...raw, sourceId:String(raw.id), store, market,
      priceMinor:Math.round(raw.price * 100),
      originalPriceMinor:raw.originalPrice == null ? null : Math.round(raw.originalPrice * 100),
      images, color:detail.color ?? raw.color ?? null,
      type:detail.type ?? raw.type ?? null, details:raw.details ?? null };
    return transaction(() => {
      const exact = db.prepare('SELECT * FROM products WHERE store=? AND source_id=? AND market=?').get(store,String(raw.id),market);
      // Replace legacy UK offers with verified Swedish data without losing likes or snapshots.
      const legacy=!exact&&store==='asos'&&market==='SE'
        ?db.prepare("SELECT * FROM products WHERE store='asos' AND source_id=? AND market='GB'").get(String(raw.id)):null;
      const old=exact??legacy;
      const id = old?.id ?? randomUUID();
      // A failed detail refresh must not discard a previously fetched gallery or attributes.
      if (old && !record.details) {
        const previous = JSON.parse(old.data);
        if (previous.details) {
          record.details=previous.details; record.images=previous.images;
          record.color=record.color??previous.color; record.type=record.type??previous.type;
        }
      }
      const data = JSON.stringify(record);
      const hash = createHash('sha256').update(data).digest('hex');
      const previous = old?.snapshot_id ? db.prepare('SELECT hash FROM snapshots WHERE id=?').get(old.snapshot_id) : null;
      const snapshotId = previous?.hash === hash ? old.snapshot_id : randomUUID();
      const now = new Date().toISOString();
      if(old)db.prepare('UPDATE products SET market=?,updated_at=?,data=? WHERE id=?').run(market,now,data,id);
      else db.prepare('INSERT INTO products(id,store,source_id,market,updated_at,data) VALUES(?,?,?,?,?,?)')
        .run(id,store,String(raw.id),market,now,data);
      if (snapshotId !== old?.snapshot_id) db.prepare('INSERT INTO snapshots VALUES(?,?,?,?,?)').run(snapshotId,id,now,hash,data);
      db.prepare('UPDATE products SET snapshot_id=? WHERE id=?').run(snapshotId,id);
      return id;
    });
  }
  function list(now=new Date()) {
    const day=discoveryDay(now);
    return db.prepare(`SELECT p.*,s.decision,s.saved,
      (SELECT e.created_at FROM events e WHERE e.product_id=p.id AND e.kind IN ('like','pass')
       AND NOT EXISTS(SELECT 1 FROM events u WHERE u.kind='undo' AND u.reverses=e.id)
       ORDER BY e.seq DESC LIMIT 1) AS decided_at
      FROM products p LEFT JOIN states s ON s.product_id=p.id ORDER BY p.rowid`).all()
      .map(p=>({...JSON.parse(p.data),id:p.id,snapshotId:p.snapshot_id,updatedAt:p.updated_at,decision:p.decision??null,saved:Boolean(p.saved),
        seenToday:p.decided_at?discoveryDay(p.decided_at)===day:false}));
  }
  function lastDecision() {
    return db.prepare(`SELECT e.id FROM events e WHERE kind IN ('like','pass')
      AND NOT EXISTS(SELECT 1 FROM events u WHERE u.kind='undo' AND u.reverses=e.id) ORDER BY seq DESC LIMIT 1`).get()?.id ?? null;
  }
  function project(productId) {
    const actions = db.prepare(`SELECT e.* FROM events e WHERE product_id=?
      AND NOT EXISTS(SELECT 1 FROM events u WHERE u.kind='undo' AND u.reverses=e.id) ORDER BY seq`).all(productId);
    let decision=null,saved=0;
    for(const e of actions){if(e.kind==='like'){decision='liked';saved=1;}
      if(e.kind==='pass'){decision='passed';saved=0;}if(e.kind==='unsave')saved=0;}
    db.prepare(`INSERT INTO states VALUES(?,?,?) ON CONFLICT(product_id) DO UPDATE SET decision=excluded.decision,saved=excluded.saved`)
      .run(productId,decision,saved);
  }
  function act({id,productId,snapshotId,kind,reverses=null,context={}}) {
    if(typeof id!=='string'||!/^[\w-]{16,100}$/.test(id)||!['impression','like','pass','unsave','undo','open_store'].includes(kind))
      throw new Error('Ogiltig handling.');
    return transaction(()=>{
      const prior=db.prepare('SELECT * FROM events WHERE id=?').get(id);
      if(prior){if(prior.kind!==kind||(kind!=='undo'&&prior.product_id!==(productId??null))||prior.reverses!==reverses)throw new Error('Handlings-ID används redan.');return {id,productId:prior.product_id,duplicate:true};}
      if(kind==='undo'){
        const target=db.prepare("SELECT * FROM events WHERE id=? AND kind IN ('like','pass')").get(reverses);
        if(!target||target.id!==lastDecision())throw new Error('Det beslutet går inte längre att ångra.');
        productId=target.product_id;snapshotId=target.snapshot_id;
      }
      const product=db.prepare('SELECT id,snapshot_id FROM products WHERE id=?').get(productId);
      if(!product)throw new Error('Produkten finns inte.');
      snapshotId??=product.snapshot_id;
      if(!db.prepare('SELECT id FROM snapshots WHERE id=? AND product_id=?').get(snapshotId,productId))throw new Error('Fel produktversion.');
      db.prepare('INSERT INTO events(id,product_id,snapshot_id,kind,reverses,context,created_at) VALUES(?,?,?,?,?,?,?)')
        .run(id,productId,snapshotId,kind,reverses,JSON.stringify(context),new Date().toISOString());
      if(['like','pass','unsave','undo'].includes(kind))project(productId);
      return {id,productId};
    });
  }
  function sources() {
    return Object.fromEntries(db.prepare('SELECT store,url FROM import_sources').all().map(s=>[s.store,s.url]));
  }
  function catalog(store,url){return db.prepare('SELECT * FROM import_catalogs WHERE store=? AND url=?').get(store,url)??null;}
  function catalogs(){return Object.entries(sources()).map(([store,url])=>({store,url,...catalog(store,url)}));}
  function catalogStart(store,url,now=new Date()) {
    const previous=catalog(store,url);
    // Continue unfinished lists across days; restart a completed list on a later Swedish day.
    if(previous?.exhausted&&discoveryDay(previous.checked_at)!==discoveryDay(now))return firstCatalogPage(store,url);
    return previous?.next_page??firstCatalogPage(store,url);
  }
  function saveCatalogPage(store,url,result,now=new Date()) {
    const signature=createHash('sha256').update(result.products.map(p=>p.id).sort().join('|')).digest('hex');
    return transaction(()=>{
      const previous=catalog(store,url);
      const restarting=previous?.exhausted&&discoveryDay(previous.checked_at)!==discoveryDay(now);
      if(restarting)db.prepare('DELETE FROM catalog_pages WHERE store=? AND url=?').run(store,url);
      if(result.products.length&&db.prepare('SELECT page FROM catalog_pages WHERE store=? AND url=? AND signature=? AND page<>?').get(store,url,signature,result.page))
        throw new Error('Butiken upprepade en tidigare sida. Importen pausas utan att märkas färdighämtad.');
      db.prepare('INSERT OR REPLACE INTO catalog_pages VALUES(?,?,?,?,?)').run(store,url,result.page,signature,result.missingCount??0);
      const scanned=Number(db.prepare('SELECT COUNT(*) n FROM catalog_pages WHERE store=? AND url=?').get(store,url).n);
      const missing=Number(db.prepare('SELECT SUM(missing_count) n FROM catalog_pages WHERE store=? AND url=?').get(store,url).n);
      db.prepare(`INSERT INTO import_catalogs VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(store,url) DO UPDATE SET
        next_page=excluded.next_page,scanned_pages=excluded.scanned_pages,total_pages=excluded.total_pages,
        total_count=excluded.total_count,exhausted=excluded.exhausted,checked_at=excluded.checked_at,missing_count=excluded.missing_count`)
        .run(store,url,result.page+1,scanned,result.totalPages,result.totalCount,Number(result.exhausted),new Date(now).toISOString(),missing);
    });
  }
  function createJob(store, sourceUrl) {
    const canonical=validateCategoryUrl(store,sourceUrl??sources()[store]);
    return transaction(()=>{
      const existing=db.prepare("SELECT * FROM import_jobs WHERE status IN ('queued','running') ORDER BY created_at LIMIT 1").get();
      if(existing){
        if(existing.store===store&&(existing.source_url??DEFAULT_SOURCE_URLS[store])===canonical)return existing;
        throw new Error('En annan hämtning pågår. Vänta tills den är klar.');
      }
      const id=randomUUID(),now=new Date().toISOString();
      const progress=catalog(store,canonical);
      if(progress?.exhausted&&discoveryDay(progress.checked_at)===discoveryDay(now))
        throw new Error('Sista sidan för den här kategorin är redan nådd idag. Du kan kontrollera den igen imorgon.');
      db.prepare('UPDATE import_sources SET url=?,updated_at=? WHERE store=?').run(canonical,now,store);
      db.prepare('INSERT INTO import_jobs(id,store,status,created_at,updated_at,message,source_url) VALUES(?,?,?,?,?,?,?)')
        .run(id,store,'queued',now,now,'Väntar på import …',canonical);
      return db.prepare('SELECT * FROM import_jobs WHERE id=?').get(id);
    });
  }
  function updateJob(id, patch) {
    const old=db.prepare('SELECT * FROM import_jobs WHERE id=?').get(id);
    const next={...old,...patch,updated_at:new Date().toISOString()};
    db.prepare('UPDATE import_jobs SET status=?,updated_at=?,total=?,completed=?,failed=?,message=? WHERE id=?')
      .run(next.status,next.updated_at,next.total,next.completed,next.failed,next.message,id);
  }
  function claimJob() {
    return transaction(()=>{
      const j=db.prepare("SELECT * FROM import_jobs WHERE status='queued' ORDER BY created_at LIMIT 1").get();
      if(!j)return null;
      updateJob(j.id,{status:'running',message:'Hämtar produktlistan …'});return j;
    });
  }
  function jobs(){return db.prepare('SELECT * FROM import_jobs ORDER BY created_at DESC LIMIT 10').all();}
  return {db,upsert,list,act,lastDecision,createJob,updateJob,claimJob,jobs,sources,catalog,catalogs,catalogStart,saveCatalogPage,discoveryClock,
    close:()=>db.close(), transaction,
    recoverJobs:()=>db.prepare("UPDATE import_jobs SET status='failed',message='Importen avbröts när servern startades om. Du kan starta en ny import.' WHERE status='running'").run(),
    stats:()=>({total:Number(db.prepare('SELECT COUNT(*) AS n FROM products').get().n),
      liked:Number(db.prepare("SELECT COUNT(*) AS n FROM states WHERE decision='liked'").get().n),
      passed:Number(db.prepare("SELECT COUNT(*) AS n FROM states WHERE decision='passed'").get().n),
      saved:Number(db.prepare('SELECT COUNT(*) AS n FROM states WHERE saved=1').get().n)})};
}
