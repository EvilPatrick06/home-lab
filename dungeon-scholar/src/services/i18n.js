// S7: minimal i18n foundation. A tiny t() over message catalogs so UI strings
// can be migrated incrementally without a heavy dependency. English is the
// default and the fallback. This is deliberately small — full string
// extraction across the app is an incremental, opt-in effort.
import { en } from './locales/en.js';
import { es } from './locales/es.js';

const CATALOGS = { en, es };
let current = 'en';

export const availableLocales = () => Object.keys(CATALOGS);
export const getLocale = () => current;

// Catalog keys for a locale (empty array for unknown locales). Used by the
// locale-completeness test to assert every non-en catalog is key-complete.
export const getCatalogKeys = (loc) => Object.keys(CATALOGS[loc] || {});

export const setLocale = (loc) => {
  if (CATALOGS[loc]) {
    current = loc;
    if (typeof document !== 'undefined') document.documentElement.lang = loc;
  }
};

// t(key, fallback): current-locale value, else English, else fallback, else key.
export function t(key, fallback) {
  const cat = CATALOGS[current] || CATALOGS.en;
  if (Object.hasOwn(cat, key)) return cat[key];
  if (Object.hasOwn(CATALOGS.en, key)) return CATALOGS.en[key];
  return fallback != null ? fallback : key;
}
