import {catalogPageUrl,parseCatalogPage} from './catalog-pages.mjs';
import {parseAsosDetails,parseZalandoDetails} from '../../product-data.mjs';
import {DEFAULT_SOURCE_URLS,validateCategoryUrl} from '../../import-sources.mjs';
import {fetchStoreHtml} from './source-fetch.mjs';
const pause=ms=>new Promise(r=>setTimeout(r,ms));

export function startImporter(store) {
  let busy=false,stopped=false;
  store.recoverJobs();
  const tick=async()=>{
    if(busy||stopped)return;
    const job=store.claimJob();if(!job)return;
    busy=true;let completed=0,failed=0;
    try{
      const source=validateCategoryUrl(job.store,job.source_url??DEFAULT_SOURCE_URLS[job.store]);
      const page=store.catalogStart(job.store,source);
      const result=parseCatalogPage(job.store,await fetchStoreHtml(catalogPageUrl(job.store,source,page),job.store),source,page);
      const count=result.products.length;
      const coverage=result.missingCount?` ${result.missingCount} produkter saknades i sidans läsbara data; samlingen är inte komplett.`:'';
      store.updateJob(job.id,{total:count,message:`Sparar sida ${page} och läser fler bilder …${coverage}`});
      for(const product of result.products)store.upsert(job.store,product,result.market);
      // Advance only after the complete page has been saved. Detail failures do not lose its products.
      store.saveCatalogPage(job.store,source,result);
      for(const product of result.products){
        if(stopped)break;
        await pause(1500);
        try{
          const html=await fetchStoreHtml(product.url,job.store);
          const details=job.store==='zalando'?parseZalandoDetails(html,product.id):parseAsosDetails(html,product.id);
          store.upsert(job.store,{...product,details,detailStatus:'fetched'},result.market);completed++;
        }catch(e){
          failed++;
          if(/HTTP (403|429)/.test(e.message))throw new Error('Butiken begränsade hämtningen. Grundprodukterna har sparats; försök igen senare.');
        }
        store.updateJob(job.id,{completed,failed,message:`Sida ${page}: ${completed} av ${count} produkter har fått detaljinformation.${coverage}`});
      }
      store.updateJob(job.id,{status:stopped?'failed':failed||result.missingCount?'partial':'completed',completed,failed,
        message:stopped?'Importen avbröts.':`Sida ${page}: ${count} produkter sparade, ${completed} med detaljer${failed?`, ${failed} detaljsidor kunde inte läsas`:''}. ${result.exhausted?'Sista sidan nådd.':'Fler sidor finns att hämta.'}${coverage}`});
    }catch(error){store.updateJob(job.id,{status:completed||store.jobs().find(j=>j.id===job.id)?.total?'partial':'failed',completed,failed,message:error.message});}
    finally{busy=false;}
  };
  const timer=setInterval(()=>void tick(),1000);
  void tick();
  return ()=>{stopped=true;clearInterval(timer);};
}
