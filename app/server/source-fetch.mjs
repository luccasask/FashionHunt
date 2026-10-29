import { validateStoreDestination } from '../../import-sources.mjs';

export async function fetchStoreHtml(value, store, fetcher = fetch) {
  let url = validateStoreDestination(value, store);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await fetcher(url.href, {
      redirect: 'manual', signal: AbortSignal.timeout(30000),
      headers: { Accept: 'text/html', 'Accept-Language': 'sv-SE,sv;q=0.9' },
    });
    if ([301,302,303,307,308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Butiken skickade en omdirigering utan adress.');
      url = validateStoreDestination(new URL(location, url).href, store);
      continue;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url.href}`);
    return response.text();
  }
  throw new Error('För många omdirigeringar från butiken.');
}
