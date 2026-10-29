// Ask the retailers' own image servers for display-sized photos, not thumbnails.
// Original source URLs remain in the database and can be used as a fallback.
export function displayImageUrl(source, width = 1200) {
  if (!source) return source;
  let url;
  try { url = new URL(source); } catch { return source; }
  if (url.protocol !== 'https:') return source;
  if (url.hostname.endsWith('.ztat.net') && url.pathname.startsWith('/article/')) {
    url.searchParams.set('imwidth', String(width));
  } else if (url.hostname === 'images.asos-media.com' && url.pathname.startsWith('/products/')) {
    for (const key of [...url.searchParams.keys()]) if (/^\$n_\d+w\$$/.test(key)) url.searchParams.delete(key);
    url.searchParams.set('wid', String(width));
    url.searchParams.set('fit', 'constrain');
    url.searchParams.set('qlt', '90');
  } else return source;
  return url.href;
}

export function uniqueProductImages(images) {
  const seen = new Set();
  return images.filter(source => {
    const key = displayImageUrl(source);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
