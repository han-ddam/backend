import { parseCsv } from './compositions.csv';
describe('parseCsv', () => {
  it('parses header + quoted commas', () => {
    const out = parseCsv('region_code,place_name,seq,title,description\n11110,"남산, 서울",0,"제목","설명, 콤마"');
    expect(out).toEqual([
      ['region_code', 'place_name', 'seq', 'title', 'description'],
      ['11110', '남산, 서울', '0', '제목', '설명, 콤마'],
    ]);
  });
  it('skips blank lines + unescapes ""', () => {
    const out = parseCsv('a,b\n\n"x""y",z\n');
    expect(out).toEqual([['a', 'b'], ['x"y', 'z']]);
  });
});
