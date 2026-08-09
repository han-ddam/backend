const HTTP_PREFIX = 'http://tong.visitkorea.or.kr';
const HTTPS_PREFIX = 'https://tong.visitkorea.or.kr';

/**
 * TourAPI(firstimage) 핫링크는 http로 내려온다. tong.visitkorea.or.kr 은 https를
 * 정상 지원하므로 선두 스킴만 https로 승격해 프론트(https) mixed-content 차단을 피한다.
 * 다른 호스트는 건드리지 않는다(place는 사용자 확장 예정 — https 미지원 호스트 보호).
 */
export function toHttpsTourImage(url: string | null): string | null {
  if (url && url.startsWith(HTTP_PREFIX)) {
    return HTTPS_PREFIX + url.slice(HTTP_PREFIX.length);
  }
  return url;
}
