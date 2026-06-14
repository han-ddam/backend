import { buildRequestContext } from './request-context';

describe('buildRequestContext', () => {
  it('defaults to KO locale', () => {
    expect(buildRequestContext({})).toEqual({ locale: 'KO' });
  });

  it('parses Accept-Language with region and quality values', () => {
    expect(buildRequestContext({ 'accept-language': 'en-US,en;q=0.9' }).locale).toBe('EN');
    expect(buildRequestContext({ 'accept-language': 'ja' }).locale).toBe('JA');
    expect(buildRequestContext({ 'accept-language': 'zh-CN' }).locale).toBe('ZH');
  });

  it('falls back to KO for an unsupported language', () => {
    expect(buildRequestContext({ 'accept-language': 'fr' }).locale).toBe('KO');
  });
});
