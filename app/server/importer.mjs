import {catalogPageUrl,parseCatalogPage} from './catalog-pages.mjs';
import {parseAsosDetails,parseZalandoDetails} from '../../product-data.mjs';
import {DEFAULT_SOURCE_URLS,validateCategoryUrl} from '../../import-sources.mjs';
import {fetchStoreHtml} from './source-fetch.mjs';
const pause=ms=>new Promise(r=>setTimeout(r,ms));

export async function startImporter(store,{recover=true}={}) {
  let busy=false,stopped=false;
  if(recover)await store.recoverJobs();
  const tick=async()=>{
    if(busy||stopped)return;
    busy=true;let completed=0,failed=0,job;
    try{
      job=await store.claimJob();if(!job)return;
      const source=validateCategoryUrl(job.store,job.source_url??DEFAULT_SOURCE_URLS[job.store]);
      const page=await store.catalogStart(job.store,source);
      const result=parseCatalogPage(job.store,await fetchStoreHtml(catalogPageUrl(job.store,source,page),job.store),source,page);
      const count=result.products.length;
      const coverage=result.missingCount?` ${result.missingCount} produkter saknades i sidans läsbara data; samlingen är inte komplett.`:'';
      await store.updateJob(job.id,{total:count,message:`Sparar sida ${page} och läser fler bilder …${coverage}`});
      for(const product of result.products)await store.upsert(job.store,product,result.market);
      // Advance only after the complete page has been saved. Detail failures do not lose its products.
      await store.saveCatalogPage(job.store,source,result);
      for(const product of result.products){
        if(stopped)break;
        await pause(1500);
        try{
          const html=await fetchStoreHtml(product.url,job.store);
          const details=job.store==='zalando'?parseZalandoDetails(html,product.id):parseAsosDetails(html,product.id);
          await store.upsert(job.store,{...product,details,detailStatus:'fetched'},result.market);completed++;
        }catch(e){
          failed++;
          if(/HTTP (403|429)/.test(e.message))throw new Error('Butiken begränsade hämtningen. Grundprodukterna har sparats; försök igen senare.');
        }
        await store.updateJob(job.id,{completed,failed,message:`Sida ${page}: ${completed} av ${count} produkter har fått detaljinformation.${coverage}`});
      }
      await store.updateJob(job.id,{status:stopped?'failed':failed||result.missingCount?'partial':'completed',completed,failed,
        message:stopped?'Importen avbröts.':`Sida ${page}: ${count} produkter sparade, ${completed} med detaljer${failed?`, ${failed} detaljsidor kunde inte läsas`:''}. ${result.exhausted?'Sista sidan nådd.':'Fler sidor finns att hämta.'}${coverage}`});
    }catch(error){if(job)await store.updateJob(job.id,{status:completed||(await store.jobs()).find(j=>j.id===job.id)?.total?'partial':'failed',completed,failed,message:error.message});else throw error;}
    finally{busy=false;}
  };
  let running=Promise.resolve();
  const schedule=()=>{if(!busy&&!stopped)running=tick().catch(()=>console.error('Importen kunde inte kontakta databasen. Försöker igen senare.'));};
  const timer=setInterval(schedule,1000);schedule();
  return async()=>{stopped=true;clearInterval(timer);await running;};
}
