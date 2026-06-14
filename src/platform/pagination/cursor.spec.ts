import { encodeCursor, decodeCursor, buildCursorPage } from './cursor';

describe('cursor pagination', () => {
  it('round-trips a cursor', () => {
    const d = new Date('2026-01-01T00:00:00.000Z');
    const dec = decodeCursor(encodeCursor(d, 'abc'));
    expect(dec?.id).toBe('abc');
    expect(dec?.createdAt.toISOString()).toBe(d.toISOString());
  });

  it('returns null for invalid/empty cursor', () => {
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor('!!notbase64!!')).toBeNull();
  });

  it('builds nextCursor only when there is an extra row', () => {
    const d = new Date();
    const rows = [
      { id: '1', createdAt: d },
      { id: '2', createdAt: d },
      { id: '3', createdAt: d },
    ];
    const page = buildCursorPage(rows, 2);
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).not.toBeNull();

    const last = buildCursorPage(rows.slice(0, 2), 2);
    expect(last.items).toHaveLength(2);
    expect(last.nextCursor).toBeNull();
  });
});
