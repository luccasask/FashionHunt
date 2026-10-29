import {hydration,asosListingData} from '../../product-data.mjs';
import {parseProducts} from '../../fetch-zalando.mjs';
import {parseAsosProducts} from '../../fetch-asos.mjs';
import {validateCategoryUrl} from '../../import-sources.mjs';

export function catalogPageUrl(store,source,page) {
 const url=new URL(validateCategoryUrl(store,source));
 url.searchParams.set(store==='zalando'?'p':'page',String(page));
 return url.href;
}
export function firstCatalogPage(store,source){return Number(new URL(source).searchParams.get(store==='zalando'?'p':'page')??1);}
export function parseCatalogPage(store,html,source,expectedPage) {
 let products,totalCount,totalPages,currentPage,missingCount=0,market='SE';
 if(store==='zalando'){
  const collections=hydration(html).flatMap(d=>Object.values(d.graphqlCache??{})).map(v=>v?.data?.collection).filter(c=>c?.entities?.pageInfo);
  const path=new URL(source).pathname;
  const c=collections.find(c=>new URL(c.uri,source).pathname===path)??(collections.length===1?collections[0]:null);
  if(!c)throw new Error('Sidinformation saknas. Kan inte avgöra nästa sida; ingen sida hoppas över.');
  const e=c.entities;
  currentPage=e.pageInfo.currentPage;totalPages=e.pageInfo.numberOfPages;totalCount=e.totalCount;
  const ids=new Set((e.edges??[]).filter(e=>e.node?.__typename==='Product').map(e=>e.node.id.replace('ern:product::','')));
  products=parseProducts(html).filter(p=>ids.has(p.id));
  missingCount=ids.size-products.length;
 }else{
  const d=asosListingData(html),s=d.search;
  if(s.error||s.searchPassMeta?.isPartial)throw new Error('ASOS skickade ett ofullständigt resultat. Försök igen senare.');
  const size=s.pageSize,offset=s.query?.offset;
  if(!Number.isInteger(size)||size<=0||!Number.isInteger(offset)||offset<0||offset%size!==0)throw new Error('ASOS sidinformation saknas.');
  currentPage=offset/size+1;totalCount=s.itemCount;totalPages=Math.max(1,Math.ceil(totalCount/size));
  const result=parseAsosProducts(html,Number.MAX_SAFE_INTEGER,source);
  if(result.market!=='SE'||result.currency!=='SEK')throw new Error('ASOS skickade inte svenska SEK-priser.');
  market=result.market;products=result.products;
  missingCount=(s.products??[]).length-products.length;
 }
 if(currentPage!==expectedPage)throw new Error(`Butiken skickade sida ${currentPage} i stället för ${expectedPage}. Ingen sida hoppas över.`);
 if(!Number.isInteger(totalPages)||totalPages<0||!Number.isInteger(totalCount)||totalCount<0)throw new Error('Butikens sidantal är ogiltigt.');
 if(!products.length&&totalCount!==0)throw new Error('Produktlistan kunde inte läsas. Den räknas inte som färdighämtad.');
 return {products,market,page:currentPage,totalPages,totalCount,missingCount,exhausted:totalCount===0||currentPage>=totalPages};
}
