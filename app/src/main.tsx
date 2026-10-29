import React, {useState,useEffect,useRef,useCallback} from 'react';
import {createRoot} from 'react-dom/client';
import {Heart, X, Undo2, SlidersHorizontal, ArrowUpRight, ChevronLeft, ChevronRight,
  Download, Check, LoaderCircle, Layers3, ArrowRight, Image as ImageIcon, WifiOff, Leaf, Sparkles, ThumbsDown, Info, UserRound, Images} from 'lucide-react';
import {swipeDecision,swipeExitDistance} from './swipe.ts';
import {displayImageUrl,uniqueProductImages} from '../../product-images.mjs';
import {DEFAULT_SOURCE_URLS,validateCategoryUrl,type StoreName} from '../../import-sources.mjs';
import './style.css';
import './reference.css';

type Details={type?:string;materialText?:string;fabric?:string;fit?:string;cut?:string;care?:string;color?:string;modelName?:string;features?:string[]};
type Product={id:string;sourceId:string;snapshotId:string;name:string;brand:string;store:string;market:string;
  price:number;originalPrice?:number;priceMinor:number;originalPriceMinor?:number;currency:string;isSale?:boolean;
  image:string;images:string[];url:string;color?:string;type?:string;supplierLabel?:string;hasMultiplePrices?:boolean;
  details?:Details;decision:'liked'|'passed'|null;saved:boolean;seenToday:boolean;updatedAt:string};
type Job={id:string;store:string;status:string;total:number;completed:number;failed:number;message:string;created_at:string;source_url?:string};
type Catalog={store:StoreName;url:string;scanned_pages?:number;total_pages?:number;total_count?:number;exhausted?:number;checked_at?:string;next_page?:number;missing_count?:number};
type State={products:Product[];stats:{total:number;liked:number;passed:number;saved:number};undoId:string|null;jobs:Job[];sources:Record<StoreName,string>;catalogs:Catalog[];discovery:{day:string;nextResetAt:string;timeZone:string}};
type Action={id:string;productId?:string;snapshotId?:string;kind:string;reverses?:string;context?:Record<string,unknown>};
type ActionResult={id:string;productId?:string;duplicate?:boolean};
const shop=(s:string)=>s==='zalando'?'Zalando':'ASOS';
const money=(n:number,currency:string)=>new Intl.NumberFormat('sv-SE',{style:'currency',currency,maximumFractionDigits:Number.isInteger(n)?0:2}).format(n);
// crypto.randomUUID is unavailable on an iPhone's plain HTTP LAN origin.
function uuid(){const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
 const h=[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}
const apiBase=(import.meta.env.VITE_API_BASE||'/api').replace(/\/$/,'');
async function api<T>(path:string,body?:unknown):Promise<T>{
 const response=await fetch(apiBase+'/'+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
 if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error??'Det gick inte att ansluta. Försök igen.');}
 return response.json();
}
function Price({p,small=false}:{p:Product;small?:boolean}){
 if(p.currency!=='SEK')return <div className="price pending-price"><span>Pris i butik</span></div>;
 const sale=p.isSale&&p.originalPrice!=null&&p.originalPrice>p.price;
 return <div className={'price '+(small?'small':'')}><strong className={sale?'sale-text':''}>{p.hasMultiplePrices?'Från ':''}{money(p.price,p.currency)}</strong>
 {sale&&<><s title="Butikens jämförelsepris">{money(p.originalPrice!,p.currency)}</s><span className="sale-tag">REA</span></>}</div>;
}
function ProductImage({src,alt,...props}:React.ImgHTMLAttributes<HTMLImageElement>){
 const [failed,setFailed]=useState(false),[original,setOriginal]=useState(false);
 useEffect(()=>{setFailed(false);setOriginal(false);},[src]);
 const requested=src?displayImageUrl(src):src;
 return failed?<div className="image-fallback"><ImageIcon size={32}/><span>Bilden kunde inte laddas</span></div>:<img decoding="async" {...props} src={original?src:requested} alt={alt} onError={event=>{
  if(!original&&requested!==src){setOriginal(true);return;}
  setFailed(true);props.onError?.(event);
 }}/>;
}

function SwipeDeck({current,next,busy,canUndo,reviewing,onDecision,onUndo,onDetails,onShown}: {
 current:Product; next?:Product; busy:boolean; canUndo:boolean;reviewing:boolean;
 onDecision:(kind:'like'|'pass',product:Product)=>Promise<boolean>;
 onUndo:()=>void;onDetails:(p:Product)=>void;onShown:()=>void;
}) {
 const [position,setPosition]=useState({x:0,y:0});
 const [dragging,setDragging]=useState(false),[leaving,setLeaving]=useState(false);
 const [frozen,setFrozen]=useState<{top:Product;under?:Product}|null>(null);
 const [imageSelection,setImageSelection]=useState({id:current.id,index:0});
 const locked=useRef(false),didDrag=useRef(false),card=useRef<HTMLElement>(null);
 const gesture=useRef<{id:number;x:number;y:number;dx:number;dy:number;time:number}|null>(null);
 const top=frozen?.top??current,under=frozen?frozen.under:next;
 useEffect(()=>{setImageSelection({id:top.id,index:0});},[top.id]);
 useEffect(()=>{
  // A preloaded under-card keeps its image element when promoted: no new load event.
  const image=card.current?.querySelector('img');
  if(!image?.complete||!image.naturalWidth)return;
  const frame=requestAnimationFrame(onShown);
  return()=>cancelAnimationFrame(frame);
 },[top.id,onShown]);

 async function commit(kind:'like'|'pass') {
  if(locked.current||busy)return;
  locked.current=true;setDragging(false);
  setFrozen({top:current,under:next});setLeaving(true);
  const sign=kind==='like'?1:-1;
  setPosition(p=>({x:sign*swipeExitDistance(window.innerWidth,card.current?.offsetWidth??400),y:p.y}));
  try {
   const [success]=await Promise.all([onDecision(kind,current),new Promise(r=>setTimeout(r,340))]);
   if(!success){setLeaving(false);setPosition({x:0,y:0});await new Promise(r=>setTimeout(r,220));}
  } finally {
   setFrozen(null);setLeaving(false);setPosition({x:0,y:0});locked.current=false;
  }
 }
 function down(e:React.PointerEvent<HTMLElement>) {
  if(locked.current||busy||!e.isPrimary||e.button!==0)return;
  didDrag.current=false;
  gesture.current={id:e.pointerId,x:e.clientX,y:e.clientY,dx:0,dy:0,time:e.timeStamp};
  const target=e.target instanceof Element?e.target.closest('button'):null;
  (target??e.currentTarget).setPointerCapture(e.pointerId);
 }
 function move(e:React.PointerEvent<HTMLElement>) {
  const g=gesture.current;if(!g||g.id!==e.pointerId||locked.current)return;
  const dx=e.clientX-g.x,dy=e.clientY-g.y;
  if(!didDrag.current&&Math.abs(dy)>Math.abs(dx)+12){gesture.current=null;return;}
  g.dx=dx;g.dy=dy;
  if(Math.abs(dx)>7){didDrag.current=true;setDragging(true);setPosition({x:dx,y:Math.max(-24,Math.min(24,dy*.12))});}
 }
 function up(e:React.PointerEvent<HTMLElement>) {
  const g=gesture.current;if(!g||g.id!==e.pointerId)return;
  gesture.current=null;setDragging(false);
  const distance=e.clientX-g.x;
  const decision=swipeDecision(distance,card.current?.offsetWidth??386,distance/Math.max(1,e.timeStamp-g.time));
  if(didDrag.current&&decision)void commit(decision);
  else setPosition({x:0,y:0});
 }
 function cancel(){gesture.current=null;setDragging(false);setPosition({x:0,y:0});didDrag.current=true;}
 function imageClick(e:React.MouseEvent<HTMLButtonElement>){
  if(didDrag.current||locked.current)return;
  const rect=e.currentTarget.getBoundingClientRect();
  const step=e.detail===0||e.clientX-rect.left>rect.width*.35?1:-1;
  setImageSelection(previous=>({id:top.id,index:((previous.id===top.id?previous.index:0)+step+top.images.length)%top.images.length}));
 }
 function content(p:Product,front:boolean){
  const index=front&&imageSelection.id===p.id?Math.min(imageSelection.index,p.images.length-1):0;
  return <>
   <button className="photo-button" tabIndex={front?0:-1} onClick={front?imageClick:undefined} aria-label={`Bläddra bland produktbilder: ${p.name}`}>
    <ProductImage src={p.images[index]??p.image} alt={p.name} draggable={false} onLoad={front?onShown:undefined} onError={front?onShown:undefined}/>
    {p.images.length>1&&<span className="photo-progress" role="img" aria-label={`Bild ${index+1} av ${p.images.length}`}>
     {p.images.map((_,i)=><span key={i} className={`image-segment${i===index?' active':i<index?' complete':''}`}>
      <span className="segment-fill" style={{width:i<=index?'100%':'0%'}}/>
     </span>)}
    </span>}
    {p.saved&&<span className="card-saved-badge" role="img" aria-label="Sparat plagg"><Heart size={16} fill="currentColor"/></span>}
    {front&&Math.abs(position.x)>45&&!leaving&&<span className={'swipe-stamp '+(position.x>0?'yes':'no')}>{position.x>0?'SPARA':'HOPPA ÖVER'}</span>}
   </button>
   <div className="card-info"><div className="brand-row"><span>{p.brand}</span></div><h3>{p.name.replace(new RegExp('^'+p.brand.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s*','i'),'')}</h3><Price p={p}/>
    {front&&<button className="product-info-button" aria-label="Visa produktinformation och alla bilder" onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();if(!locked.current)onDetails(p);}}><Info size={24}/></button>}
   </div>
  </>;
 }
 const cards=[...(under?[{product:under,front:false}]:[]),{product:top,front:true}];
 return <div className="discovery-area">
  <div className="card-stack">
   <div className="stack-layer"/>
   {cards.map(({product,front})=><article key={product.id} data-product-id={product.id} ref={front?card:undefined}
    className={`product-card ${front?'front-card':'under-card'}${front&&dragging?' dragging':''}${front&&leaving?' leaving':''}`}
    aria-hidden={!front} inert={!front}
    style={{transform:front?`translate3d(${position.x}px,${position.y}px,0) rotate(${Math.max(-24,Math.min(24,position.x*.045))}deg)`:'none'}}
    onPointerDown={front?down:undefined} onPointerMove={front?move:undefined} onPointerUp={front?up:undefined} onPointerCancel={front?cancel:undefined}>
    {content(product,front)}
   </article>)}
  </div>
  <div className="swipe-actions">
   <button className="round pass" aria-label={reviewing?'Ta bort från sparat och visa nästa':'Hoppa över plagget'} disabled={busy||leaving} onClick={()=>void commit('pass')}><ThumbsDown size={29} fill="currentColor" strokeWidth={1.3}/></button>
   <button className="round undo" aria-label="Ångra senaste valet" disabled={!canUndo||busy||leaving} onClick={onUndo}><Undo2 size={29}/></button>
   <button className="round like" aria-label={reviewing?'Behåll sparad och visa nästa':'Gilla och spara plagget'} disabled={busy||leaving} onClick={()=>void commit('like')}><Heart size={32} fill="currentColor" strokeWidth={1.3}/></button>
  </div>
 </div>;
}

function App(){
 const [data,setData]=useState<State|null>(null),[tab,setTab]=useState<'discover'|'saved'|'import'>('discover');
 const [filter,setFilter]=useState('all'),[saleOnly,setSaleOnly]=useState(false),[filtersOpen,setFiltersOpen]=useState(false);
 const [gallery,setGallery]=useState<Product|null>(null),[photo,setPhoto]=useState(0);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const [imageReady,setImageReady]=useState(false);
 const [sourceDrafts,setSourceDrafts]=useState<Partial<Record<StoreName,string>>>({});
 const [sourceTouched,setSourceTouched]=useState<Partial<Record<StoreName,boolean>>>({});
 const [sourceErrors,setSourceErrors]=useState<Partial<Record<StoreName,string>>>({});
 const [reviewIds,setReviewIds]=useState<string[]|null>(null),[reviewVisited,setReviewVisited]=useState<string[]>([]);
 const imageShown=useCallback(()=>setImageReady(true),[]);
 const galleryStart=useRef<number|null>(null);
 const savedScroll=useRef(0),impression=useRef<string>('');
 const refresh=useCallback(async()=>{const state=await api<State>('state');state.products=state.products.map(p=>({...p,images:uniqueProductImages([p.image,...p.images])}));setData(state);
  setSourceDrafts(drafts=>({zalando:state.sources?.zalando??DEFAULT_SOURCE_URLS.zalando,asos:state.sources?.asos??DEFAULT_SOURCE_URLS.asos,...drafts}));return state;
 },[]);
 useEffect(()=>{
  let alive=true;
  (async()=>{try{
    const pending=localStorage.getItem('clothes.pending-action');
    if(pending){await api('actions',JSON.parse(pending));localStorage.removeItem('clothes.pending-action');}
    if(alive)await refresh();
  }catch(e){if(alive)setError(e instanceof Error?e.message:'Anslutningen misslyckades.');}
  finally{if(alive)setLoading(false);}})();return()=>{alive=false;};
 },[refresh]);
 useEffect(()=>{if(!data?.discovery)return;const timer=setTimeout(()=>void refresh().catch(()=>{}),Math.max(50,new Date(data.discovery.nextResetAt).getTime()-Date.now()+50));return()=>clearTimeout(timer);},[data?.discovery?.nextResetAt,refresh]);
 const activeJob=data?.jobs.find(j=>['queued','running'].includes(j.status));
 useEffect(()=>{if(!activeJob)return;const timer=setInterval(()=>{void refresh().catch(()=>{});},2500);return()=>clearInterval(timer);},[activeJob?.id,refresh]);
 useEffect(()=>{
  const update=()=>{if(document.visibilityState==='visible')void refresh().catch(()=>{});};
  const timer=setInterval(update,60000);document.addEventListener('visibilitychange',update);
  return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',update);};
 },[refresh]);
 useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),3200);return()=>clearTimeout(timer);},[notice]);
 useEffect(()=>{
  if(!gallery)return;
  const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')setGallery(null);if(e.key==='ArrowRight')setPhoto(n=>Math.min(n+1,gallery.images.length-1));if(e.key==='ArrowLeft')setPhoto(n=>Math.max(n-1,0));};
  document.addEventListener('keydown',onKey);const old=document.body.style.overflow;document.body.style.overflow='hidden';
  return()=>{document.body.style.overflow=old;document.removeEventListener('keydown',onKey);};
 },[gallery]);
 const matches=(p:Product)=>(filter==='all'||p.store===filter)&&(!saleOnly||p.isSale);
 const unseen=(data?.products??[]).filter(p=>!p.saved&&!p.seenToday&&matches(p));
 const reviewing=reviewIds!==null;
 const reviewProducts=(reviewIds??[]).map(id=>data?.products.find(p=>p.id===id)).filter((p):p is Product=>!!p&&!reviewVisited.includes(p.id));
 const deck=reviewing?reviewProducts:unseen;
 const current=deck[0];
 useEffect(()=>{setImageReady(false);},[current?.id]);
 useEffect(()=>{
  if(!current||tab!=='discover'||!imageReady)return;
  const key=current.id+':'+current.snapshotId+':'+(reviewing?'saved_review':'discover');
  if(impression.current===key)return;impression.current=key;
  void api('actions',{id:uuid(),productId:current.id,snapshotId:current.snapshotId,kind:'impression',context:{filter,saleOnly,mode:reviewing?'saved_review':'discover'}}).catch(()=>{impression.current='';});
 },[current?.id,current?.snapshotId,tab,imageReady,filter,saleOnly,reviewing]);
 const openGallery=(p:Product)=>{savedScroll.current=window.scrollY;setGallery(p);setPhoto(0);};
 const closeGallery=()=>{setGallery(null);requestAnimationFrame(()=>window.scrollTo(0,savedScroll.current));};
 async function send(action:Action,refreshDelay=0){
  const animationFinished=new Promise(resolve=>setTimeout(resolve,refreshDelay));
  const pending=localStorage.getItem('clothes.pending-action');
  if(pending){const queued=JSON.parse(pending) as Action;const result=await api<ActionResult>('actions',queued);localStorage.removeItem('clothes.pending-action');await animationFinished;await refresh();
    // Repeating the failed action must not create a second preference event.
    if(queued.productId===action.productId&&queued.kind===action.kind&&queued.reverses===action.reverses)return result;
  }
  localStorage.setItem('clothes.pending-action',JSON.stringify(action));
  const result=await api<ActionResult>('actions',action);localStorage.removeItem('clothes.pending-action');await animationFinished;await refresh();return result;
 }
 async function decide(kind:'like'|'pass',p:Product){
  if(busy)return false;setBusy(true);setError('');
  try{await send({id:uuid(),productId:p.id,snapshotId:p.snapshotId,kind,context:{filter,saleOnly,mode:reviewing?'saved_review':'discover'}},340);
   if(reviewing)setReviewVisited(ids=>[...ids,p.id]);return true;
  }catch(e){setError(e instanceof Error?e.message:'Kunde inte spara.');return false;}
  finally{setBusy(false);}
 }
 async function undo(){if(!data?.undoId||busy)return;setBusy(true);setError('');try{const result=await send({id:uuid(),kind:'undo',reverses:data.undoId});if(reviewing&&result?.productId)setReviewVisited(ids=>ids.filter(id=>id!==result.productId));setNotice('Senaste valet är ångrat');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function unsave(p:Product){if(busy)return;setBusy(true);try{await send({id:uuid(),productId:p.id,snapshotId:p.snapshotId,kind:'unsave'});setNotice('Borttagen från sparat');setGallery(null);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 function draftError(store:StoreName,value:string){try{validateCategoryUrl(store,value);return '';}catch(e){return (e as Error).message;}}
 async function importShop(store:StoreName){
  const url=sourceDrafts[store]??data?.sources?.[store]??DEFAULT_SOURCE_URLS[store];
  const error=draftError(store,url);setSourceTouched(t=>({...t,[store]:true}));
  if(error){setSourceErrors(e=>({...e,[store]:error}));return;}
  setError('');setSourceErrors(e=>({...e,[store]:''}));
  try{const job=await api<Job>('imports',{store,url});setSourceDrafts(d=>({...d,[store]:job.source_url??url}));await refresh();setNotice('Importen har startat');}
  catch(e){setSourceErrors(errors=>({...errors,[store]:(e as Error).message}));}
 }
 function startReview(){const ids=(data?.products??[]).filter(p=>p.saved).map(p=>p.id);if(!ids.length)return;setReviewIds(ids);setReviewVisited([]);setFilter('all');setSaleOnly(false);setFiltersOpen(false);setTab('discover');}
 function stopReview(){setReviewIds(null);setReviewVisited([]);}
 function navigate(key:'discover'|'saved'|'import'){stopReview();setTab(key);window.scrollTo(0,0);}
 const nav=[{key:'saved' as const,label:'Sparat',Icon:Heart},{key:'discover' as const,label:'Upptäck',Icon:Images},{key:'import' as const,label:'Hämta',Icon:UserRound}];
 const saved=(data?.products??[]).filter(p=>p.saved&&matches(p));
 return <div className={'app-shell '+(tab==='discover'?'discovery':'')}>
  <header className="topbar"><button className="wordmark" onClick={()=>setTab('discover')} aria-label="Kläder, gå till Upptäck">kläder<span>.</span></button>
   <span className="top-caption">MINDRE LETANDE. MER DU.</span><span className="local-label"><span/>Din klädkatalog</span></header>
  <div className="workspace">
   <aside className="side-panel"><div className="eyebrow">ETT PLAGG I TAGET</div><h1>Hitta det<br/>som känns <em>du.</em></h1><p>Från dina favoritbutiker till din nästa favorit. Välj med känslan.</p>
    <div className="desktop-nav">{nav.map(({key,label,Icon})=><button className={tab===key?'active':''} key={key} onClick={()=>setTab(key)}><Icon size={20}/>{label}{key==='saved'&&<span>{data?.stats.saved??0}</span>}</button>)}</div>
    <div className="sidebar-note"><Leaf size={20}/><div><strong>Din stil, i din takt.</strong><p>Vi sparar dina val. Du bestämmer vad som följer med.</p></div></div>
    <span className="build-label">LOKAL TESTVERSION · UTAN INLOGGNING</span>
   </aside>
   <main>
    <div className="section-heading"><div><h2>{tab==='discover'?(reviewing?'Sparade plagg':'Herrkläder'):tab==='saved'?'Sparade plagg':'Hämta kläder'}</h2><p className="collection-subtitle">{tab==='discover'&&reviewing?`${current?reviewVisited.length+1:reviewVisited.length} av ${reviewIds?.length??0} · behåll eller välj bort`:<>{filter==='all'?'Zalando & ASOS':shop(filter)} | {tab==='saved'?`${saved.length} sparade plagg`:`${data?.products.filter(matches).length??0} hämtade produkter`}</>}</p></div>
    <div className="heading-actions">{tab==='discover'&&reviewing?<button className="filter-button" aria-label="Avsluta genomgången av sparade plagg" onClick={stopReview}><X size={24}/></button>:tab!=='import'&&<button className={'filter-button '+(filtersOpen?'selected':'')} onClick={()=>setFiltersOpen(!filtersOpen)} aria-label="Visa filter" aria-expanded={filtersOpen}><SlidersHorizontal size={24}/>{(filter!=='all'||saleOnly)&&<i/>}</button>}
    {tab==='discover'&&current&&<a className="store-link-button" href={current.url} target="_blank" rel="noopener noreferrer" aria-label={`Öppna plagget hos ${shop(current.store)}`}><ArrowUpRight size={27}/></a>}</div></div>
    {filtersOpen&&!reviewing&&tab!=='import'&&<div className="filter-panel"><div className="filter-chips">{[['all','Alla butiker'],['zalando','Zalando'],['asos','ASOS']].map(([key,label])=><button key={key} className={filter===key?'selected':''} onClick={()=>setFilter(key)}>{label}</button>)}</div><label><input type="checkbox" checked={saleOnly} onChange={e=>setSaleOnly(e.target.checked)}/> Visa bara rea</label><p>Priser visas i svenska kronor. Äldre varor utan verifierat SEK-pris visar ”Pris i butik”.</p></div>}
    {error&&<div className="error-banner" role="alert"><WifiOff size={18}/><div>{error}<small>Ditt val försvinner inte. Försök igen när anslutningen fungerar.</small></div><button onClick={()=>{setError('');window.location.reload();}}>Försök igen</button></div>}
    {loading?<div className="empty-state"><LoaderCircle className="spin"/><h3>Plockar fram din klädkatalog …</h3></div>:
    tab==='discover'?<>
      {current?<SwipeDeck current={current} next={deck[1]} busy={busy} reviewing={reviewing} canUndo={!!data?.undoId&&(!reviewing||reviewVisited.length>0)} onDecision={decide} onUndo={()=>void undo()} onDetails={openGallery} onShown={imageShown}/>:<div className="empty-state"><div className="empty-icon"><Check size={28}/></div><h3>{reviewing?'Genomgången är klar.':'Dagens hämtade plagg är klara.'}</h3><p>{reviewing?'Du har gått igenom de sparade plaggen.':'Det kan finnas fler produkter i butikerna. Se hämtningsstatus eller gå igenom dina favoriter igen.'}</p>
       {!reviewing&&<p className="reset-note">Bortvalda plagg visas igen vid midnatt, svensk tid. Dina favoriter finns kvar.</p>}
       {!!data?.stats.saved&&<button className="primary-button review-start" onClick={startReview}><Heart size={17}/>{reviewing?'Gå igenom sparade igen':'Gå igenom sparade plagg'} <span>({data.stats.saved})</span></button>}
       {reviewing?<button className="text-button" onClick={stopReview}>Till nya plagg</button>:<button className={data?.stats.saved?'text-button':'primary-button'} onClick={()=>navigate('import')}>Hämta fler plagg <ArrowRight size={16}/></button>}
       {data?.undoId&&(!reviewing||reviewVisited.length>0)&&<button className="text-button" onClick={()=>void undo()}>Ångra senaste valet</button>}</div>}

    </>:tab==='saved'?<>{saved.length?<div className="saved-grid">{saved.map(p=><article className="saved-card" key={p.id}><button className="saved-image" onClick={()=>openGallery(p)}><ProductImage src={p.image} alt={p.name} loading="lazy"/><span className="saved-heart"><Heart size={15} fill="currentColor"/></span></button><span className="saved-brand">{p.brand}</span><button className="saved-title" onClick={()=>openGallery(p)}>{p.name}</button><Price p={p} small/></article>)}</div>:<div className="empty-state"><div className="empty-icon"><Heart size={28}/></div><h3>Här börjar din önskelista.</h3><p>Gilla ett plagg så sparas det här. Du kan kika närmare på det när du vill.</p><button className="primary-button" onClick={()=>setTab('discover')}>Upptäck plagg <ArrowRight size={16}/></button></div>}</>:
    <div className="import-view"><p className="intro-copy">Hämta nästa sida från din kategori. Produktuppgifterna sparas först, därefter hämtas fler bilder och detaljer. Eventuellt bortfall visas nedan.</p>
     {(['zalando','asos'] as StoreName[]).map((s,i)=>{
      const value=sourceDrafts[s]??data?.sources?.[s]??DEFAULT_SOURCE_URLS[s];
      const invalid=draftError(s,value);
      const message=sourceErrors[s]||(sourceTouched[s]?invalid:'');
      const canonical=invalid?'':validateCategoryUrl(s,value);
      const catalog=data?.catalogs?.find(c=>c.store===s&&c.url===canonical);
      const finishedToday=!!catalog?.exhausted&&!!catalog.checked_at&&new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Stockholm',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(catalog.checked_at))===data?.discovery?.day;
      return <form className="source-section" key={s} onSubmit={e=>{e.preventDefault();void importShop(s);}}>
       <label className="source-label" htmlFor={`source-${s}`}>Kategorilänk för {shop(s)}</label>
       <input id={`source-${s}`} name={`source-${s}`} className="source-input" type="url" inputMode="url" autoComplete="off" autoCapitalize="none" spellCheck={false} required maxLength={2048}
        value={value} disabled={!!activeJob} aria-invalid={!!message} aria-describedby={`source-${s}-hint`}
        onChange={e=>{setSourceDrafts(d=>({...d,[s]:e.target.value}));setSourceTouched(t=>({...t,[s]:true}));setSourceErrors(errors=>({...errors,[s]:''}));}}/>
       <p id={`source-${s}-hint`} className={message?'source-error':'source-hint'} role={message?'alert':undefined}>{message||'Klistra in en kategori, t.ex. kläder eller skor. Länken sparas när du hämtar.'}</p>
       <article className="import-shop"><div className={'shop-symbol '+s}>{s==='zalando'?'Z':'a'}</div><div><h3>{shop(s)}</h3><p>{s==='zalando'?'Produkter · priser i SEK':'Svenska sidan · priser i SEK'}</p></div><button type="submit" className="import-button" disabled={!!activeJob||!!invalid||finishedToday}>{activeJob?.store===s?<LoaderCircle size={18} className="spin"/>:<Download size={18}/>}<span>{finishedToday?'Klart idag':'Hämta'}</span></button><span className="shop-number">0{i+1}</span></article>
       <p className="catalog-status" role="status">{catalog?.checked_at?<>{catalog.scanned_pages} sidor hämtade · butiken anger {catalog.total_pages} sidor och cirka {catalog.total_count?.toLocaleString('sv-SE')} produkter.<br/>{catalog.exhausted?(finishedToday?'Sista sidan nådd vid senaste hämtningen. Ny kontroll möjlig imorgon.':'Sista sidan nådd tidigare. Nästa hämtning söker från början igen.'):`Fortsätt från sida ${catalog.next_page}. Fler sidor återstår.`}</>:'Hela kategorin är ännu inte kontrollerad. Nästa hämtning börjar på länkens första sida.'}</p>
       {!!catalog?.missing_count&&<p className="source-error">Ofullständig samling: {catalog.missing_count} produkter saknades i de läsbara siduppgifterna. Sista sidan betyder därför inte att alla produkter är sparade.</p>}
      </form>;
     })}
     {activeJob&&<div className="active-job" role="status"><LoaderCircle size={20} className="spin"/><div><strong>Hämtar från {shop(activeJob.store)}</strong><p>{activeJob.message}</p><div className="progress"><i style={{width:`${activeJob.total?(activeJob.completed+activeJob.failed)/activeJob.total*100:5}%`}}/></div><small>Du kan fortsätta upptäcka plagg medan vi hämtar.</small></div></div>}
     <div className="import-info"><Layers3 size={19}/><p>Bortvalda plagg kan visas igen varje dag från kl. 00.00, svensk tid. Sparade favoriter och hela historiken behålls. Butikernas sortering och antal kan ändras mellan hämtningarna.</p></div>
     <div className="import-history"><h3>Senaste hämtningar</h3>{data?.jobs.length?data.jobs.map(j=><div className="history-row" key={j.id}><span className={'status-dot '+j.status}/><div><strong>{shop(j.store)}</strong><p>{j.message}</p></div><time>{new Date(j.created_at).toLocaleDateString('sv-SE',{month:'short',day:'numeric'})}</time></div>):<p>Ingen ny import ännu. Katalogen innehåller produkter från de tidigare testhämtningarna.</p>}</div>
     <a className="export-link" href={apiBase+'/export'} download><Download size={15}/> Exportera produktdata och din historik</a>
    </div>}
   </main>
   <aside className="right-panel"><div className="collection-note"><span className="mini-icon"><Sparkles size={19}/></span><span className="eyebrow">DIN EGEN KOLLEKTION</span><h3>Lite mer<br/>din stil.</h3><p>Det du gillar stannar. Resten lämnar plats åt något nytt.</p><div className="stat-row"><strong>{data?.stats.saved??0}</strong><span>sparade plagg</span></div><div className="stat-row"><strong>{data?.stats.total??0}</strong><span>plagg i katalogen</span></div></div><p className="quiet-note">Priser är från senaste hämtningen.<br/>Aktuellt pris och lager visas i butiken.</p></aside>
  </div>
  <nav className="bottom-nav" aria-label="Huvudnavigation">{nav.map(({key,label,Icon})=><button key={key} className={tab===key?'active':''} aria-current={tab===key?'page':undefined} onClick={()=>navigate(key)}><span><Icon size={21} fill={key==='saved'&&tab===key?'currentColor':'none'}/>{key==='saved'&&!!data?.stats.saved&&<i>{data.stats.saved}</i>}</span>{label}</button>)}</nav>
  {notice&&<div className="toast" role="status"><Check size={16}/>{notice}</div>}
  {gallery&&<div className="modal-backdrop" onClick={closeGallery}><section className="gallery-modal" role="dialog" aria-modal="true" aria-label={`Produktbilder: ${gallery.name}`} onClick={e=>e.stopPropagation()}>
    <header className="gallery-top"><span>{shop(gallery.store)}</span><button className="icon-button" onClick={closeGallery} aria-label="Stäng produktbilder" autoFocus><X size={22}/></button></header>
    <div className="gallery-photo" onPointerDown={e=>{galleryStart.current=e.clientX;}} onPointerUp={e=>{if(galleryStart.current!==null){const dx=e.clientX-galleryStart.current;if(Math.abs(dx)>45)setPhoto(n=>Math.max(0,Math.min(gallery.images.length-1,n+(dx<0?1:-1))));galleryStart.current=null;}}} onPointerCancel={()=>{galleryStart.current=null;}}>
      <ProductImage src={gallery.images[photo]} alt={`${gallery.name}, bild ${photo+1}`} draggable={false}/>
      <span className="image-count">{photo+1} / {gallery.images.length}</span>
      {gallery.images.length>1&&<><button className="gallery-arrow previous" disabled={photo===0} onClick={()=>setPhoto(n=>n-1)} aria-label="Föregående bild"><ChevronLeft size={24}/></button><button className="gallery-arrow next" disabled={photo===gallery.images.length-1} onClick={()=>setPhoto(n=>n+1)} aria-label="Nästa bild"><ChevronRight size={24}/></button></>}
    </div>
    <div className="gallery-content"><span className="eyebrow">{gallery.brand}</span><h2>{gallery.name}</h2><Price p={gallery}/>
     {gallery.images.length===1&&<p className="detail-note">En bild finns sparad. En ny import försöker hämta fler produktbilder.</p>}
     <dl>{[['Plaggtyp',gallery.type??gallery.supplierLabel],['Färg',gallery.color],['Material',gallery.details?.materialText],['Tyg',gallery.details?.fabric],['Passform',gallery.details?.fit],['Snitt',gallery.details?.cut],['Skötsel',gallery.details?.care]].filter(([,v])=>v).map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
     {!gallery.details&&<p className="detail-note">Material och passform är inte hämtade för det här plagget ännu.</p>}
     <a className="primary-button" href={gallery.url} target="_blank" rel="noopener noreferrer" onClick={()=>{void api('actions',{id:uuid(),productId:gallery.id,snapshotId:gallery.snapshotId,kind:'open_store'}).catch(()=>{});}}>Visa hos {shop(gallery.store)} <ArrowUpRight size={18}/></a>
     {gallery.saved&&<button className="text-button unsave" disabled={busy} onClick={()=>void unsave(gallery)}>Ta bort från sparat</button>}
     <p className="detail-note">Senast hämtad {new Date(gallery.updatedAt).toLocaleDateString('sv-SE')}. Pris och tillgänglighet kan ändras.</p>
    </div>
  </section></div>}
 </div>;
}

createRoot(document.getElementById('root')!).render(<App/>);
