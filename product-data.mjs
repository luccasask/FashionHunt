export function scripts(html) {
  return [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => ({tag:m[0].slice(0,m[0].indexOf('>')+1), text:m[1]}));
}
export function readObject(text,start) {
  let depth=0, quoted=false, escaped=false;
  for(let i=start;i<text.length;i++){
    const c=text[i];
    if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}
    if(c==='"')quoted=true;
    else if(c==='{'||c==='[')depth++;
    else if(c==='}'||c===']'){if(--depth===0)return JSON.parse(text.slice(start,i+1));}
  }
  throw new Error('Incomplete JSON');
}
export function asosConfig(html,key) {
  const re=new RegExp('window\\.asos\\.pdp\\.config\\.'+key+'\\s*=\\s*','g');
  const matches=[...html.matchAll(re)];
  for(const m of matches.reverse()) {
    const start=m.index+m[0].length;
    if(html[start]==='{'||html[start]==='['){try{return readObject(html,start);}catch{}}
    if(html[start]==="'"||html[start]==='"')return JSON.parse(readString(html,start));
  }
  return null;
}
export function zalandoCaches(html) {
  const caches=hydration(html).map(d=>d.graphqlCache??{});
  for(const s of scripts(html)){
    const marker="runtime['hydratePartial'](";
    const i=s.text.indexOf(marker);
    if(i>=0)caches.push(readObject(s.text,i+marker.length).cache??{});
  }
  return caches;
}
// Decode a quoted JavaScript string without executing scripts from a remote site.
export function readString(text, start) {
  const quote=text[start];
  if (!['"', "'"].includes(quote)) throw new Error('Expected string');
  let out='';
  for(let i=start+1;i<text.length;i++) {
    let c=text[i];
    if(c===quote)return out;
    if(c!=='\\'){out+=c;continue;}
    c=text[++i];
    if(c==='u'||c==='x'){const n=c==='u'?4:2;out+=String.fromCharCode(parseInt(text.slice(i+1,i+1+n),16));i+=n;}
    else out+=({n:'\n',r:'\r',t:'\t',b:'\b',f:'\f',v:'\v','0':'\0'}[c]??c);
  }
  throw new Error('Unterminated string');
}
export function asosListingData(html) {
  const marker='window.asos.plp._data=JSON.parse(';
  const i=html.indexOf(marker);
  if(i<0)throw new Error('ASOS produktdata saknas; sidan kan ha ändrats eller blockerats.');
  return JSON.parse(readString(html,i+marker.length));
}
export function hydration(html) {
  return scripts(html).flatMap(s=>{
    const m=s.text.match(/window\.__hydrationDataConsume\(\s*([\s\S]*?)\s*\);?\s*$/);
    return m?[JSON.parse(m[1])]:[];
  });
}
export function structuredData(html) {
  return scripts(html).filter(s=>s.tag.includes('application/ld+json')).flatMap(s=>{
    const d=JSON.parse(s.text);return Array.isArray(d)?d:[d];
  });
}

export function plainText(value) {
  return String(value??'').replace(/<br\s*\/?\s*>|<\/li>/gi,'\n').replace(/<[^>]*>/g,'')
    .replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/&#39;/g,"'").replace(/&quot;/g,'"').trim();
}
function ratingFromSchema(schema) {
  const r=schema?.aggregateRating;
  if(r?.ratingValue==null)return null;
  return { average:Number(r.ratingValue), count:r.ratingCount!=null?Number(r.ratingCount):r.reviewCount!=null?Number(r.reviewCount):null,
    scale:r.bestRating!=null?Number(r.bestRating):null, source:'structured-data' };
}
export function parseAsosDetails(html, expectedId) {
  const p=asosConfig(html,'product');
  if(!p?.id||String(p.id)!==String(expectedId))throw new Error('ASOS: fel eller saknad produkt på detaljsidan.');
  const desc=asosConfig(html,'productDescription')??{};
  const schema=structuredData(html).find(x=>x['@type']==='Product'&&String(x.productID)===String(expectedId));
  const rating=ratingFromSchema(schema);
  const features=[...(desc.productDescription??'').matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map(m=>plainText(m[1]));
  return {
    type:p.productType?.name??null, modelName:null,
    color:schema?.color??p.variants?.find(v=>v.isPrimary)?.colour??null,
    materialText:desc.aboutMe?plainText(desc.aboutMe):null,
    fit:features.find(x=>/\bfit\b/i.test(x))??null,
    features, care:desc.careInfo?plainText(desc.careInfo):null,
    sizeAndFit:desc.sizeAndFit?plainText(desc.sizeAndFit):null,
    images:(p.images??[]).filter(i=>i.isVisible).map(i=>i.url),
    rating, ratingStatus:rating?'available':'not_in_html',
    rawRatings:asosConfig(html,'ratings'),
  };
}
export function parseZalandoDetails(html, sku) {
  const parts=zalandoCaches(html).flatMap(c=>Object.values(c).map(e=>e.data?.product))
    .filter(p=>p?.sku===sku);
  if(!parts.length)throw new Error('Zalando: fel eller saknad produkt på detaljsidan.');
  const attributes=parts.flatMap(p=>(p.attributeSuperClusters??[]).flatMap(g=>(g.clusters??[])
    .flatMap(c=>(c.attributes??[]).filter(a=>typeof a.value==='string').map(a=>({group:g.label,key:a.key,value:a.value})))));
  const unique=[...new Map(attributes.map(a=>[JSON.stringify(a),a])).values()];
  const attr=k=>unique.find(a=>a.key===k)?.value??null;
  const field=k=>parts.map(p=>p[k]).find(x=>x!=null);
  const schema=structuredData(html).find(x=>x.productGroupID===sku||x.sku===sku);
  const reviewed=parts.find(p=>p.reviewStatus);
  const rawRating=parts.map(p=>p.family?.ratingAndReviews?.rating).find(x=>x!=null)??null;
  const rating=ratingFromSchema(schema);
  return {
    type:field('category')??field('leadingCategory')?.name??null,
    modelName:field('supplierName')??null,
    color:field('color')?.name??schema?.color??null,
    materialText:attr('Material')??attr('Yttermaterial'), fabric:attr('Tyg'),
    fit:attr('Passform'), cut:attr('Modell'), care:attr('Skötselråd'),
    attributes:unique, rating, rawRating,
    images:(Array.isArray(schema?.image)?schema.image:schema?.image?[schema.image]:[]),
    ratingStatus:rating?'available':reviewed?.reviewStatus==='NOT_REVIEWED'?'not_reviewed':'not_parsed',
  };
}
