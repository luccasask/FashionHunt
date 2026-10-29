import {catalogPageUrl,parseCatalogPage} from './catalog-pages.mjs';
import {parseAsosDetails,parseZalandoDetails} from '../../product-data.mjs';
import {validateCategoryUrl} from '../../import-sources.mjs';
import {fetchStoreHtml} from './source-fetch.mjs';

export async function runImportSlice(store,{jobId=null,fetchHtml=fetchStoreHtml,delay=ms=>new Promise(r=>setTimeout(r,ms)),maxDetails=2}={}){
 const job=await store.leaseEdgeJob(jobId);if(!job)return {idle:true};
 const token=job.lease_token,started=Date.now();let work=job.work_data?JSON.parse(job.work_data):null;
 let completed=job.completed,failed=job.failed;
 try{
  const source=validateCategoryUrl(job.store,job.source_url);
  if(!work){
   const page=await store.catalogStart(job.store,source);
   const result=parseCatalogPage(job.store,await fetchHtml(catalogPageUrl(job.store,source,page),job.store),source,page);
   work={...result,index:0,prepared:false};
   await store.saveEdgeJob(job.id,token,{total:work.products.length,work_data:JSON.stringify(work),message:`Sparar sida ${page} …`});
  }
  if(!work.prepared){
   for(const product of work.products)await store.upsert(job.store,product,work.market);
   await store.saveCatalogPage(job.store,source,work);
   work.prepared=true;
   await store.saveEdgeJob(job.id,token,{work_data:JSON.stringify(work)});
  }
  const coverage=work.missingCount?` ${work.missingCount} produkter saknades i sidans läsbara data.`:'';
  for(let count=0;count<maxDetails&&work.index<work.products.length&&Date.now()-started<60000;count++){
   await delay(1500);const product=work.products[work.index];
   try{
    const html=await fetchHtml(product.url,job.store);
    const details=job.store==='zalando'?parseZalandoDetails(html,product.id):parseAsosDetails(html,product.id);
    await store.upsert(job.store,{...product,details,detailStatus:'fetched'},work.market);completed++;
   }catch(e){failed++;if(/HTTP (403|429)/.test(e.message))throw new Error('Butiken begränsade hämtningen. Grundprodukterna är sparade; försök igen senare.');}
   work.index++;
   await store.saveEdgeJob(job.id,token,{completed,failed,work_data:JSON.stringify(work),message:`Sida ${work.page}: ${completed} av ${work.products.length} produkter har fått detaljer.${coverage}`});
  }
  const done=work.index>=work.products.length;
  await store.saveEdgeJob(job.id,token,{completed,failed,status:done?(failed||work.missingCount?'partial':'completed'):'running',work_data:done?null:JSON.stringify(work),
   message:done?`Sida ${work.page}: ${work.products.length} produkter sparade, ${completed} med detaljer. ${work.exhausted?'Sista sidan nådd.':'Fler sidor finns.'}${coverage}`:`Sida ${work.page}: ${completed} av ${work.products.length} med detaljer. Nästa omgång fortsätter automatiskt.${coverage}`});
  return {jobId:job.id,done};
 }catch(e){
  await store.saveEdgeJob(job.id,token,{completed,failed,status:work?.prepared?'partial':'failed',message:e.message});
  return {jobId:job.id,failed:true};
 }finally{await store.releaseEdgeJob(job.id,token);}
}
