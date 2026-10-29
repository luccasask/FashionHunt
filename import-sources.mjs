export const DEFAULT_SOURCE_URLS = Object.freeze({
  zalando: 'https://www.zalando.se/herrklader/',
  asos: 'https://www.asos.com/se/man/ctas/masten/cat/?cid=51177',
});

export function validateStoreDestination(value, store) {
  if (!Object.hasOwn(DEFAULT_SOURCE_URLS, store)) throw new Error('Okänd butik.');
  let url;
  try { url = new URL(value); } catch { throw new Error('Ange en fullständig https-länk.'); }
  const hosts = store === 'zalando' ? ['zalando.se', 'www.zalando.se'] : ['asos.com', 'www.asos.com'];
  if (url.protocol !== 'https:' || !hosts.includes(url.hostname) || url.port || url.username || url.password)
    throw new Error(`Använd en https-länk till ${store === 'zalando' ? 'www.zalando.se' : 'www.asos.com'}.`);
  url.hostname = hosts[1];
  url.hash = '';
  return url;
}

export function validateCategoryUrl(store, value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 2048)
    throw new Error('Klistra in en kategorilänk från butiken.');
  const url = validateStoreDestination(value.trim(), store);
  if (store === 'zalando') {
    if (url.pathname === '/' || /\.|%2f|%5c/i.test(url.pathname) ||
        /^\/(api|account|myaccount|login|checkout|cart|help|kundservice|zalando-privat|anvandarvillkor)(\/|$)/i.test(url.pathname))
      throw new Error('Använd en kategorisida, till exempel zalando.se/herrskor/.');
    if (!url.pathname.endsWith('/')) url.pathname += '/';
    if (url.searchParams.has('p') && !/^[1-9]\d{0,4}$/.test(url.searchParams.get('p')))
      throw new Error('Sidnumret i länken är ogiltigt.');
  } else {
    if (!url.pathname.startsWith('/se/'))
      throw new Error('Använd ASOS svenska länk (asos.com/se/…) så att priset blir i SEK.');
    if (!/\/cat\/?$/.test(url.pathname) || !/^[1-9]\d{0,9}$/.test(url.searchParams.get('cid') ?? ''))
      throw new Error('Använd en ASOS-kategorilänk med /cat/ och cid, inte en enskild produkt.');
    if (url.searchParams.has('page') && !/^[1-9]\d{0,4}$/.test(url.searchParams.get('page')))
      throw new Error('Sidnumret i länken är ogiltigt.');
  }
  // Keep filters such as size, colour and price; remove only marketing parameters.
  for (const key of [...url.searchParams.keys()])
    if (/^(utm_|ctaref$|affid$|gclid$|fbclid$)/i.test(key)) url.searchParams.delete(key);
  return url.href;
}
