// Use a verified Swedish category capture to refresh matching legacy products only.
import {readFile} from 'node:fs/promises';
import {parseAsosProducts} from '../fetch-asos.mjs';
import {openDatabase} from '../app/server/database.mjs';
import assert from 'node:assert/strict';
const result=parseAsosProducts(await readFile('output/probe/asos-se.html','utf8'),72);
if(result.currency!=='SEK'||result.market!=='SE')throw new Error('Svenska SEK-priser krävs.');
const db=openDatabase(process.env.KLADER_DB_PATH??'app/data/clothes.sqlite');
try{
 const existing=new Map(db.list().filter(p=>p.store==='asos').map(p=>[p.sourceId,p]));
 let count=0;
 for(const p of result.products){
  const previous=existing.get(p.id);if(!previous)continue;
  const id=db.upsert('asos',{...p,details:previous.details,images:previous.images},'SE');
  assert.equal(id,previous.id,'Befintliga produkt-ID:n ska bevaras.');count++;
 }
 console.log(`${count} befintliga ASOS-produkter fick verifierade SEK-priser. Beslut och historik bevarades.`);
}finally{db.close();}
