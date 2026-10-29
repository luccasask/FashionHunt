import {asosListingData} from './product-data.mjs';
import {DEFAULT_SOURCE_URLS} from './import-sources.mjs';
const SOURCE=DEFAULT_SOURCE_URLS.asos;
export function parseAsosProducts(html,limit=50,source=SOURCE) {
  const d=asosListingData(html);
  const currency=d.config?.country?.defaultCurrency;
  if(!currency)throw new Error('ASOS: valuta saknas.');
  const products=new Map();
  for(const p of d.search?.products??[]){
    const current=p.isSale&&p.reducedPrice!=null?p.reducedPrice:p.price;
    if(!p.id||!p.brandName||!p.image||!p.url||!Number.isFinite(current))continue;
    const url=new URL(p.url,d.config.country.countryCode==='SE'?'https://www.asos.com/se/':'https://www.asos.com/');
    if(url.hostname!=='www.asos.com')continue;
    products.set(p.id,{
      id:String(p.id),name:p.description,brand:p.brandName,
      price:current,originalPrice:p.price,currency,isSale:p.isSale===true,
      discountPercent:p.isSale&&p.price>current?Math.round((1-current/p.price)*100):null,
      image:new URL(p.image.startsWith('http')?p.image:'https://'+p.image.replace(/^\/\//,'')).href,
      url:url.href,color:p.colour??null,hasMultiplePrices:p.hasMultiplePrices??null,
      details:null,detailStatus:'not_fetched',
    });
    if(products.size>=limit)break;
  }
  return {source,fetchedAt:new Date().toISOString(),requested:limit,count:products.size,
    complete:products.size===limit,market:d.config.country.countryCode,currency,products:[...products.values()]};
}
