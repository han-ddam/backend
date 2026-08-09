import { toHttpsTourImage } from './tour-image';

describe('toHttpsTourImage', () => {
  it('upgrades http TourAPI host to https', () => {
    expect(
      toHttpsTourImage('http://tong.visitkorea.or.kr/cms/resource/00/1_image2.jpg'),
    ).toBe('https://tong.visitkorea.or.kr/cms/resource/00/1_image2.jpg');
  });

  it('leaves already-https TourAPI urls untouched', () => {
    const url = 'https://tong.visitkorea.or.kr/cms/resource/00/1_image2.jpg';
    expect(toHttpsTourImage(url)).toBe(url);
  });

  it('passes null through', () => {
    expect(toHttpsTourImage(null)).toBeNull();
  });

  it('does not touch other http hosts (place is user-extensible)', () => {
    const url = 'http://example.com/pic.jpg';
    expect(toHttpsTourImage(url)).toBe(url);
  });

  it('only rewrites the leading scheme, not occurrences mid-url', () => {
    expect(
      toHttpsTourImage('http://tong.visitkorea.or.kr/x?u=http://tong.visitkorea.or.kr/y'),
    ).toBe('https://tong.visitkorea.or.kr/x?u=http://tong.visitkorea.or.kr/y');
  });
});
