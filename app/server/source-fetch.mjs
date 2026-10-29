import { validateStoreDestination } from '../../import-sources.mjs';

export async function fetchStoreHtml(value, store, fetcher = fetch) {
  let url = validateStoreDestination(value, store);
  for (let redirects = 0; redirects <= 3; redirects++) {
    let response;
    try{response = await fetcher(url.href, {
      redirect: 'manual', signal: AbortSignal.timeout(30000),
      headers: { Accept: 'text/html', 'Accept-Language': 'sv-SE,sv;q=0.9' },
    });}catch(error){
      if(['TimeoutError','AbortError'].includes(error.name))throw new Error('Butiken svarade inte i tid. Försök igen senare.');
      throw new Error('Kunde inte ansluta till butiken från servern. Försök igen senare eller hämta från datorn.');
    }
    if ([301,302,303,307,308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Butiken skickade en omdirigering utan adress.');
      url = validateStoreDestination(new URL(location, url).href, store);
      continue;
    }
    if (!response.ok) throw new Error(response.status===403?'HTTP 403: Butiken tillåter inte hämtning från den här servern. Försök senare eller hämta från datorn.':response.status===429?'HTTP 429: Butiken begränsar hämtningen. Vänta innan du försöker igen.':`HTTP ${response.status}: Butikssidan kunde inte hämtas.`);
    return response.text();
  }
  throw new Error('För många omdirigeringar från butiken.');
}
