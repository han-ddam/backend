import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import * as schema from '../schema';

/**
 * Seed the `place` table (관광지 좌표) from TourAPI areaBasedList2.
 *   pnpm seed:places
 *
 * - 전국을 페이지네이션으로 순회(areaCode 미지정) → mapx(경도)/mapy(위도)/주소/이름 적재.
 * - region_code = `${areacode}_${sigungucode}` (seed-regions와 동일 규칙).
 *   해당 DISTRICT가 region 테이블에 없으면 FK 위반이라 skip.
 * - 좌표(mapx·mapy) 없는 항목은 skip(이 시드의 목적이 좌표라서).
 * - tourapi_content_id 기준 upsert라 재실행 안전. base_points·rarity_weight는
 *   건드리지 않음(어드민 수동 큐레이션). 이름/주소는 place_trans(KO)만 채움.
 *
 * env:
 *   TOURAPI_KEY                (필수, data.go.kr 인증키 — Encoding 키 그대로)
 *   TOURAPI_AREABASED_URL      (선택, 기본 KorService2/areaBasedList2)
 *   TOURAPI_CONTENT_TYPE_IDS   (선택, 기본 '12'=관광지. 콤마구분: '12,14,25')
 *   TOURAPI_PLACE_ROWS         (선택, 페이지당 행수, 기본 100)
 *   TOURAPI_PLACE_MAX          (선택, 타입별 최대 처리 건수 — 테스트용)
 */
const BASE =
  process.env.TOURAPI_AREABASED_URL ??
  'https://apis.data.go.kr/B551011/KorService2/areaBasedList2';
const KEY = process.env.TOURAPI_KEY;
const CONTENT_TYPE_IDS = (process.env.TOURAPI_CONTENT_TYPE_IDS ?? '12')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const ROWS = Number(process.env.TOURAPI_PLACE_ROWS ?? '100');
const MAX = process.env.TOURAPI_PLACE_MAX
  ? Number(process.env.TOURAPI_PLACE_MAX)
  : Infinity;

interface PlaceItem {
  contentId: string;
  title: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  regionCode: string | null;
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) && n !== 0 ? n : null;
}

async function fetchPage(
  contentTypeId: string,
  pageNo: number,
): Promise<{ items: PlaceItem[]; totalCount: number }> {
  const params = new URLSearchParams({
    MobileOS: 'ETC',
    MobileApp: 'handdam',
    _type: 'json',
    arrange: 'A', // 제목순(대표이미지 유무 무관 → 전수)
    contentTypeId,
    numOfRows: String(ROWS),
    pageNo: String(pageNo),
  });
  // serviceKey는 이미 인코딩된 값일 수 있어 직접 붙임(다시 인코딩 X)
  const url = `${BASE}?${params.toString()}&serviceKey=${KEY}`;

  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`TourAPI ${res.status}: ${text.slice(0, 200)}`);
  }
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`TourAPI non-JSON response (키 확인): ${text.slice(0, 200)}`);
  }
  const body = data?.response?.body ?? {};
  const totalCount = Number(body.totalCount ?? 0);
  const raw = body.items?.item ?? [];
  const arr = Array.isArray(raw) ? raw : [raw];
  const items: PlaceItem[] = arr
    .filter((i) => i && i.contentid != null)
    .map((i) => {
      const areacode = i.areacode != null ? String(i.areacode) : null;
      const sigungu = i.sigungucode != null ? String(i.sigungucode) : null;
      return {
        contentId: String(i.contentid),
        title: String(i.title ?? '').trim(),
        address: i.addr1 ? String(i.addr1).trim() : null,
        lat: num(i.mapy),
        lng: num(i.mapx),
        regionCode: areacode && sigungu ? `${areacode}_${sigungu}` : null,
      };
    });
  return { items, totalCount };
}

async function main() {
  if (!KEY) {
    console.error('TOURAPI_KEY 가 설정되지 않았습니다 (.env 확인)');
    process.exit(1);
  }
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL 이 설정되지 않았습니다 (.env 확인)');
    process.exit(1);
  }

  console.log(`endpoint: ${BASE}`);
  console.log(`contentTypeIds: ${CONTENT_TYPE_IDS.join(', ')} · rows/page: ${ROWS}`);
  console.log(`key: 길이 ${KEY.length}, ${KEY.slice(0, 4)}...${KEY.slice(-4)}`);

  const client = postgres(dbUrl, { max: 1 });
  const db = drizzle(client, { schema });
  try {
    // FK 보호: 등록 가능한 DISTRICT region code 집합
    const regionRows = await db
      .select({ code: schema.regions.code })
      .from(schema.regions)
      .where(sql`${schema.regions.level} = 'DISTRICT'`);
    const validRegions = new Set(regionRows.map((r) => r.code));
    if (validRegions.size === 0) {
      throw new Error('DISTRICT region이 없습니다 — 먼저 `pnpm seed:regions` 실행');
    }
    console.log(`유효 DISTRICT region ${validRegions.size}개`);

    const upsertPlace = async (p: PlaceItem) => {
      const [row] = await db
        .insert(schema.places)
        .values({
          id: uuidv7(),
          regionCode: p.regionCode!,
          tourapiContentId: p.contentId,
          lat: p.lat,
          lng: p.lng,
        })
        .onConflictDoUpdate({
          target: schema.places.tourapiContentId,
          set: {
            lat: p.lat,
            lng: p.lng,
            regionCode: p.regionCode!,
            updatedAt: sql`now()`,
          },
        })
        .returning({ id: schema.places.id });
      await db
        .insert(schema.placeTrans)
        .values({
          placeId: row.id,
          locale: 'KO',
          name: p.title,
          address: p.address,
        })
        .onConflictDoUpdate({
          target: [schema.placeTrans.placeId, schema.placeTrans.locale],
          set: { name: p.title, address: p.address },
        });
    };

    let grandUpserted = 0;
    let grandSkipped = 0;
    for (const ctid of CONTENT_TYPE_IDS) {
      const first = await fetchPage(ctid, 1);
      const total = Math.min(first.totalCount, MAX);
      console.log(`[type ${ctid}] totalCount ${first.totalCount} → 처리 대상 ${total}`);

      let processed = 0;
      let upserted = 0;
      let skipped = 0;
      let page = 1;
      let items = first.items;
      while (items.length > 0 && processed < total) {
        for (const p of items) {
          if (processed >= total) break;
          processed++;
          if (!p.lat || !p.lng || !p.regionCode || !validRegions.has(p.regionCode)) {
            skipped++;
            continue;
          }
          await upsertPlace(p);
          upserted++;
        }
        if (processed >= total) break;
        page++;
        items = (await fetchPage(ctid, page)).items;
      }
      console.log(`[type ${ctid}] upsert ${upserted}, skip ${skipped}`);
      grandUpserted += upserted;
      grandSkipped += skipped;
    }
    console.log(`완료 — upsert ${grandUpserted}, skip ${grandSkipped}`);
  } finally {
    await client.end();
  }
}

void main();
