/** Keyset(cursor) pagination helpers — cursor encodes (createdAt, id). */
export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface DecodedCursor {
  createdAt: Date;
  id: string;
}

export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString('base64url');
}

export function decodeCursor(cursor?: string): DecodedCursor | null {
  if (!cursor) return null;
  try {
    const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
    const createdAt = new Date(iso);
    if (!id || Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

/**
 * Given rows fetched with `limit+1` ordered by (createdAt DESC, id DESC),
 * build the page + nextCursor.
 */
export function buildCursorPage<T extends { createdAt: Date; id: string }>(
  rows: T[],
  limit: number,
): CursorPage<T> {
  const hasNext = rows.length > limit;
  const items = hasNext ? rows.slice(0, limit) : rows;
  const last = items.at(-1);
  return {
    items,
    nextCursor: hasNext && last ? encodeCursor(last.createdAt, last.id) : null,
  };
}
