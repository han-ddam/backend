/** Per-request context derived from client headers. */
export type Locale = 'KO' | 'EN' | 'JA' | 'ZH';
export type Client = 'IOS' | 'ANDROID' | 'ADMIN' | 'UNKNOWN';

export interface RequestContext {
  /** From `Accept-Language` (KO/EN/JA/ZH), defaults to KO. */
  locale: Locale;
  /** From `X-Client` (ios/android/admin) — native only, defaults to UNKNOWN. */
  client: Client;
}

const LOCALES: Record<string, Locale> = { ko: 'KO', en: 'EN', ja: 'JA', zh: 'ZH' };
const CLIENTS: Record<string, Client> = {
  ios: 'IOS',
  android: 'ANDROID',
  admin: 'ADMIN',
};

type Headers = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? '';
}

/** Pure, testable builder — reads the relevant headers into a RequestContext. */
export function buildRequestContext(headers: Headers): RequestContext {
  // "en-US,en;q=0.9" -> "en"
  const primaryLang = first(headers['accept-language'])
    .split(',')[0]
    .trim()
    .slice(0, 2)
    .toLowerCase();

  const clientKey = first(headers['x-client']).trim().toLowerCase();

  return {
    locale: LOCALES[primaryLang] ?? 'KO',
    client: CLIENTS[clientKey] ?? 'UNKNOWN',
  };
}
