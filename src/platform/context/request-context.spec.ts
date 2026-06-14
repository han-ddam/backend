import { buildRequestContext } from './request-context';

describe('buildRequestContext', () => {
  it('defaults to KO locale and UNKNOWN client', () => {
    expect(buildRequestContext({})).toEqual({ locale: 'KO', client: 'UNKNOWN' });
  });

  it('parses Accept-Language with region and quality values', () => {
    expect(buildRequestContext({ 'accept-language': 'en-US,en;q=0.9' }).locale).toBe('EN');
    expect(buildRequestContext({ 'accept-language': 'ja' }).locale).toBe('JA');
    expect(buildRequestContext({ 'accept-language': 'zh-CN' }).locale).toBe('ZH');
  });

  it('falls back to KO for an unsupported language', () => {
    expect(buildRequestContext({ 'accept-language': 'fr' }).locale).toBe('KO');
  });

  it('parses X-Client case-insensitively', () => {
    expect(buildRequestContext({ 'x-client': 'iOS' }).client).toBe('IOS');
    expect(buildRequestContext({ 'x-client': 'ANDROID' }).client).toBe('ANDROID');
    expect(buildRequestContext({ 'x-client': 'admin' }).client).toBe('ADMIN');
  });

  it('falls back to UNKNOWN for an unrecognized client (e.g. web, removed)', () => {
    expect(buildRequestContext({ 'x-client': 'web' }).client).toBe('UNKNOWN');
    expect(buildRequestContext({ 'x-client': 'desktop' }).client).toBe('UNKNOWN');
  });
});
