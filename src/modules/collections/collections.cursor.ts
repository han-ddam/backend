/** collections 도메인 전용 커서: 테마/상세는 seq|id, 병합은 R|code / T|seq|id. */

export function encodeSeqCursor(seq: number, id: string): string {
  return Buffer.from(`${seq}|${id}`).toString('base64url');
}

export function decodeSeqCursor(cursor?: string): { seq: number; id: string } | null {
  if (!cursor) return null;
  try {
    const [seqStr, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
    const seq = Number(seqStr);
    if (!id || !Number.isInteger(seq)) return null;
    return { seq, id };
  } catch {
    return null;
  }
}

/** limit+1로 조회된 rows에서 페이지 + nextCursor(seq|id) 구성. */
export function buildSeqPage<T>(
  rows: T[],
  limit: number,
  key: (r: T) => { seq: number; id: string },
): { items: T[]; nextCursor: string | null } {
  const hasNext = rows.length > limit;
  const items = hasNext ? rows.slice(0, limit) : rows;
  const last = items.at(-1);
  const k = last ? key(last) : null;
  return { items, nextCursor: hasNext && k ? encodeSeqCursor(k.seq, k.id) : null };
}

export function encodeMergedRegion(code: string): string {
  return Buffer.from(`R|${code}`).toString('base64url');
}

export function encodeMergedTheme(seq: number, id: string): string {
  return Buffer.from(`T|${seq}|${id}`).toString('base64url');
}

export function decodeMergedCursor(
  cursor?: string,
): { kind: 'REGION'; code: string } | { kind: 'THEME'; seq: number; id: string } | null {
  if (!cursor) return null;
  try {
    const parts = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
    if (parts[0] === 'R' && parts[1]) return { kind: 'REGION', code: parts[1] };
    if (parts[0] === 'T' && parts[2] && Number.isInteger(Number(parts[1]))) {
      return { kind: 'THEME', seq: Number(parts[1]), id: parts[2] };
    }
    return null;
  } catch {
    return null;
  }
}
