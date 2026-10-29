import {DEFAULT_SOURCE_URLS} from './import-sources.mjs';
const SOURCE=DEFAULT_SOURCE_URLS.zalando;
// Read JSON already embedded in the public page. Never execute remote scripts.
export function parseProducts(html) {
  const products = new Map();
  let foundData = false;
  for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    const match = script[1].match(/window\.__hydrationDataConsume\(\s*([\s\S]*?)\s*\);?\s*$/);
    if (!match) continue;
    foundData = true;
    const data = JSON.parse(match[1]);
    for (const entry of Object.values(data.graphqlCache ?? {})) {
      const p = entry?.data?.product;
      if (!p?.sku || !p.brand?.name || !p.name || !p.uri) continue;
      const image = p.extraLargeDefaultMedia?.uri ?? p.largeDefaultMedia?.uri;
      const display = p.displayPrice;
      const money = display?.promotional ?? display?.original;
      const currency = money?.currency ?? display?.original?.currency;
      const price = typeof display?.trackingCurrentAmount === 'number'
        ? display.trackingCurrentAmount : money?.amount / 100;
      if (!image || !Number.isFinite(price) || price < 0 || !currency) continue;
      const url = new URL(p.uri, SOURCE);
      if (url.protocol !== 'https:' || url.hostname !== 'www.zalando.se') continue;
      if (new URL(image).protocol !== 'https:') continue;
      products.set(p.sku, {
        id: p.sku, name: p.name, brand: p.brand.name,
        price, currency, image, url: url.href,
        originalPrice: typeof display?.original?.amount === 'number' ? display.original.amount / 100 : null,
        isSale: typeof display?.original?.amount === 'number' ? price < display.original.amount / 100 : null,
        supplierLabel: p.supplierName ?? null,
        modelName: null,
        categoryCode: p.silhouette ?? null,
        targetGroup: p.navigationTargetGroup ?? null,
      });
    }
  }
  if (!foundData) throw new Error('Produktdata saknas. Sidan kan ha ändrats eller hämtningen blockerats.');
  return [...products.values()];
}

