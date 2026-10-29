// Copy a consistent read snapshot. Never modify the SQLite source, and refuse a populated target.
export async function migrateSqlite(source,target){
 const tables=['products','snapshots','states','events','import_jobs','import_sources','import_catalogs','catalog_pages'];
 let snapshot;
 source.exec('BEGIN');
 try{
  if(source.prepare("SELECT COUNT(*) n FROM import_jobs WHERE status IN ('queued','running')").get().n)throw new Error('Vänta tills den lokala importen är klar innan överföringen.');
  snapshot=Object.fromEntries(tables.map(table=>[table,source.prepare(`SELECT * FROM ${table}${table==='events'?' ORDER BY seq':table==='products'?' ORDER BY rowid':''}`).all()]));
  source.exec('COMMIT');
 }catch(e){source.exec('ROLLBACK');throw e;}
 return target.transaction(async q=>{
  for(const table of tables.filter(t=>t!=='import_sources'))if(Number((await q(`SELECT COUNT(*) n FROM fashionhunt.${table}`))[0].n))throw new Error('Måldatabasen innehåller redan FashionHunt-data. Ingenting ersattes.');
  for(const table of tables){
   for(const row of snapshot[table]){
    const columns=Object.keys(row),params=columns.map((_,i)=>'$'+(i+1));
    // Only known schema columns obtained from the local database are allowed.
    if(columns.some(c=>!/^[a-z_]+$/.test(c)))throw new Error('Okänd kolumn i lokal databas.');
    const conflict=table==='import_sources'?' ON CONFLICT(store) DO UPDATE SET url=excluded.url,updated_at=excluded.updated_at':'';
    await q(`INSERT INTO fashionhunt.${table}(${columns.join(',')}) VALUES(${params.join(',')})${conflict}`,Object.values(row));
   }
  }
  await q("SELECT setval(pg_get_serial_sequence('fashionhunt.events','seq'),GREATEST(COALESCE((SELECT MAX(seq) FROM fashionhunt.events),0),1),(SELECT COUNT(*)>0 FROM fashionhunt.events))");
  return {products:snapshot.products.length,events:snapshot.events.length,saved:snapshot.states.filter(s=>s.saved===1).length};
 });
}
