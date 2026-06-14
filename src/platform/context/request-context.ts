/** Per-request context derived from client headers. */
export type Locale = 'KO' | 'EN' | 'JA' | 'ZH';

export interface RequestContext {
  /** From `Accept-Language` (KO/EN/JA/ZH), defaults to KO. */
  locale: Locale;
}

const LOCALES: Record<string, Locale> = { ko: 'KO', en: 'EN', ja: 'JA', zh: 'ZH' };

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

  return { locale: LOCALES[primaryLang] ?? 'KO' };
}
