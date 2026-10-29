export type StoreName = 'zalando' | 'asos';
export const DEFAULT_SOURCE_URLS: Readonly<Record<StoreName,string>>;
export function validateStoreDestination(value: string, store: StoreName): URL;
export function validateCategoryUrl(store: StoreName, value: string): string;
