import {
  encodeSeqCursor,
  decodeSeqCursor,
  buildSeqPage,
  encodeMergedRegion,
  encodeMergedTheme,
  decodeMergedCursor,
} from './collections.cursor';

describe('collections.cursor', () => {
  it('seq cursor round-trips', () => {
    const c = encodeSeqCursor(3, 'abc');
    expect(decodeSeqCursor(c)).toEqual({ seq: 3, id: 'abc' });
  });

  it('decodeSeqCursor returns null for undefined/garbage', () => {
    expect(decodeSeqCursor(undefined)).toBeNull();
    expect(decodeSeqCursor('!!!not-base64!!!')).toBeNull();
  });

  it('buildSeqPage slices to limit and emits nextCursor from last item', () => {
    const rows = [
      { seq: 1, pid: 'p1' },
      { seq: 2, pid: 'p2' },
    ];
    const page = buildSeqPage(rows, 1, (r) => ({ seq: r.seq, id: r.pid }));
    expect(page.items).toEqual([{ seq: 1, pid: 'p1' }]);
    expect(decodeSeqCursor(page.nextCursor!)).toEqual({ seq: 1, id: 'p1' });
  });

  it('buildSeqPage nextCursor null when no next', () => {
    const rows = [{ seq: 1, id: 'p1' }];
    const page = buildSeqPage(rows, 5, (r) => ({ seq: r.seq, id: r.id }));
    expect(page.nextCursor).toBeNull();
  });

  it('merged region and theme cursors decode by kind', () => {
    expect(decodeMergedCursor(encodeMergedRegion('32'))).toEqual({ kind: 'REGION', code: '32' });
    expect(decodeMergedCursor(encodeMergedTheme(4, 'cid'))).toEqual({ kind: 'THEME', seq: 4, id: 'cid' });
    expect(decodeMergedCursor(undefined)).toBeNull();
    expect(decodeMergedCursor('garbage')).toBeNull();
  });
});
