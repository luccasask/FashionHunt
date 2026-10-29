import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {asosListingData,parseAsosDetails} from './product-data.mjs';
import {toCsv} from './fetch-zalando.mjs';
import {DEFAULT_SOURCE_URLS} from './import-sources.mjs';

// Official sv-SE alternate URL supplied by ASOS for the same category.
export const SOURCE=DEFAULT_SOURCE_URLS.asos;
import {parseAsosProducts} from './asos-products.mjs';
export {parseAsosProducts} from './asos-products.mjs';
export async function getHtml(url){
  const r=await fetch(url,{signal:AbortSignal.timeout(30000)});
  if(!r.ok)throw new Error(`HTTP ${r.status}: ${url}`);
  return r.text();
}
async function main(){
  const count=Number(process.argv[2]??50), detailCount=Number(process.argv[3]??3);
  if(!Number.isInteger(count)||count<1||count>72||!Number.isInteger(detailCount)||detailCount<0||detailCount>count)
    throw new Error('Använd: node fetch-asos.mjs [antal 1–72] [antal detaljsidor 0–antal]');
  const result=parseAsosProducts(await getHtml(SOURCE),count);
  if(!result.count)throw new Error('Inga ASOS-produkter hittades.');
  // Include a sale product in the small detail sample when one is present.
  const sale=result.products.find(p=>p.isSale);
  const selected=[...new Set([result.products[0],...(sale?[sale]:[]),...result.products])].slice(0,detailCount);
  for(const p of selected){
    await new Promise(r=>setTimeout(r,1500));
    try{p.details=parseAsosDetails(await getHtml(p.url),p.id);p.detailStatus='fetched';}
    catch(e){p.detailStatus='error';p.detailError=e.message;}
    console.log(p.id,p.detailStatus);
  }
  await mkdir('output',{recursive:true});
  await writeFile('output/asos-products.json',JSON.stringify(result,null,2)+'\n');
  await writeFile('output/asos-products.csv',toCsv(result.products));
  console.log(`Sparade ${result.count} ASOS-produkter (${result.currency}), ${selected.filter(p=>p.detailStatus==='fetched').length} detaljsidor.`);
  if(!result.complete||selected.some(p=>p.detailStatus==='error'))process.exitCode=2;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  main().catch(e=>{console.error(e.message);process.exitCode=1;});
