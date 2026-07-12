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
 *   TOURAPI_LOCALE             (선택, 기본 'KO'. KO|EN|JA|ZH)
 *
 * ## Locale-aware 동작 (TOURAPI_LOCALE)
 *
 * - `KO`(기본): 기존 동작 그대로 — place row를 신규 upsert하고 place_trans(KO)를 채움.
 * - `EN`/`JA`/`ZH`: **place row를 새로 만들지 않는다.** EngService2(등 외국어 서비스)의
 *   contentId는 국문과 다르고(예: KOR 2740067 ↔ ENG 3091770), contentTypeId 체계도
 *   다르다(관광지: 국문 12 ↔ 영문 76 — 실행 시 TOURAPI_CONTENT_TYPE_IDS를 꼭 맞출 것).
 *   대신 영문 title이 한글 원명을 마지막 괄호로 포함하는 규칙
 *   (`"Baengnokdam Lake (한라산 백록담)"`)을 이용해 기존 KO place를 찾아
 *   place_trans(LOCALE)만 upsert한다. 매칭 실패 시 skip.
 *
 * EN 실행 예:
 *   TOURAPI_LOCALE=EN pnpm seed:places
 */
const LOCALE = (process.env.TOURAPI_LOCALE ?? 'KO') as 'KO' | 'EN' | 'JA' | 'ZH';

const LOCALE_DEFAULTS: Record<string, { url: string; typeIds: string }> = {
  KO: {
    url: 'https://apis.data.go.kr/B551011/KorService2/areaBasedList2',
    typeIds: '12',
  },
  EN: {
    url: 'https://apis.data.go.kr/B551011/EngService2/areaBasedList2',
    typeIds: '76',
  },
};

const defaults = LOCALE_DEFAULTS[LOCALE] ?? LOCALE_DEFAULTS.KO;
const BASE = process.env.TOURAPI_AREABASED_URL ?? defaults.url;
const KEY = process.env.TOURAPI_KEY;
const CONTENT_TYPE_IDS = (process.env.TOURAPI_CONTENT_TYPE_IDS ?? defaults.typeIds)
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
  areaCode: string | null;
  regionCode: string | null;
  image: string | null;
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
        areaCode: areacode,
        regionCode: areacode && sigungu ? `${areacode}_${sigungu}` : null,
        image:
          (i.firstimage2 && String(i.firstimage2).trim()) ||
          (i.firstimage && String(i.firstimage).trim()) ||
          null,
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
  console.log(`locale: ${LOCALE}`);
  console.log(`contentTypeIds: ${CONTENT_TYPE_IDS.join(', ')} · rows/page: ${ROWS}`);
  console.log(`key: 길이 ${KEY.length}, ${KEY.slice(0, 4)}...${KEY.slice(-4)}`);

  const client = postgres(dbUrl, { max: 1 });
  const db = drizzle(client, { schema });
  try {
    // FK 보호: 등록 가능한 DISTRICT region code 집합 (KO 신규 등록 시에만 사용)
    const regionRows = await db
      .select({ code: schema.regions.code })
      .from(schema.regions)
      .where(sql`${schema.regions.level} = 'DISTRICT'`);
    const validRegions = new Set(regionRows.map((r) => r.code));
    if (validRegions.size === 0) {
      throw new Error('DISTRICT region이 없습니다 — 먼저 `pnpm seed:regions` 실행');
    }
    console.log(`유효 DISTRICT region ${validRegions.size}개`);

    // KO: 기존 동작 — place 신규 upsert + place_trans(KO) 채움.
    const upsertPlaceKo = async (p: PlaceItem) => {
      const [row] = await db
        .insert(schema.places)
        .values({
          id: uuidv7(),
          regionCode: p.regionCode!,
          tourapiContentId: p.contentId,
          lat: p.lat,
          lng: p.lng,
          imageUrl: p.image,
        })
        .onConflictDoUpdate({
          target: schema.places.tourapiContentId,
          set: {
            lat: p.lat,
            lng: p.lng,
            regionCode: p.regionCode!,
            imageUrl: p.image,
            updatedAt: sql`now()`,
          },
        })
        .returning({ id: schema.places.id });
      await db
        .insert(schema.placeTrans)
        .values({
          placeId: row.id,
          locale: LOCALE,
          name: p.title,
          address: p.address,
        })
        .onConflictDoUpdate({
          target: [schema.placeTrans.placeId, schema.placeTrans.locale],
          set: { name: p.title, address: p.address },
        });
    };

    // non-KO: place row는 신규 생성하지 않음 — 기존 KO place를 이름/좌표로 매칭해
    // place_trans(LOCALE)만 upsert. 매칭 실패 시 skip.
    const matchExistingPlace = async (p: PlaceItem): Promise<'byName' | 'byCoord' | null> => {
      const ko = p.title.match(/\(([^()]*)\)\s*$/)?.[1]?.trim();
      if (ko && p.areaCode) {
        const rows = await db.execute<{ id: string }>(sql`
          select p.id as id
          from place p
          join place_trans t on t.place_id = p.id and t.locale = 'KO'
          where t.name = ${ko} and p.region_code like ${p.areaCode + '\\_%'} and p.status = 'ACTIVE'
        `);
        if (rows.length === 1) {
          await upsertTrans(rows[0].id, p);
          return 'byName';
        }
      }
      if (p.lat != null && p.lng != null) {
        const rows = await db.execute<{ id: string }>(sql`
          select id
          from place
          where status = 'ACTIVE'
            and lat is not null and lng is not null
            and ST_DWithin(
              ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography,
              ST_SetSRID(ST_MakePoint(${p.lng}, ${p.lat}), 4326)::geography,
              100
            )
          order by ST_Distance(
            ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography,
            ST_SetSRID(ST_MakePoint(${p.lng}, ${p.lat}), 4326)::geography
          )
          limit 1
        `);
        if (rows.length === 1) {
          await upsertTrans(rows[0].id, p);
          return 'byCoord';
        }
      }
      return null;
    };

    const upsertTrans = async (placeId: string, p: PlaceItem) => {
      await db
        .insert(schema.placeTrans)
        .values({
          placeId,
          locale: LOCALE,
          name: p.title,
          address: p.address,
        })
        .onConflictDoUpdate({
          target: [schema.placeTrans.placeId, schema.placeTrans.locale],
          set: { name: p.title, address: p.address },
        });
    };

    let grandUpserted = 0;
    let grandByName = 0;
    let grandByCoord = 0;
    let grandSkipped = 0;
    for (const ctid of CONTENT_TYPE_IDS) {
      const first = await fetchPage(ctid, 1);
      const total = Math.min(first.totalCount, MAX);
      console.log(`[type ${ctid}] totalCount ${first.totalCount} → 처리 대상 ${total}`);

      let processed = 0;
      let upserted = 0;
      let byName = 0;
      let byCoord = 0;
      let skipped = 0;
      let page = 1;
      let items = first.items;
      while (items.length > 0 && processed < total) {
        for (const p of items) {
          if (processed >= total) break;
          processed++;
          if (LOCALE === 'KO') {
            if (!p.lat || !p.lng || !p.regionCode || !validRegions.has(p.regionCode)) {
              skipped++;
              continue;
            }
            await upsertPlaceKo(p);
            upserted++;
          } else {
            const method = await matchExistingPlace(p);
            if (method === 'byName') byName++;
            else if (method === 'byCoord') byCoord++;
            else skipped++;
          }
        }
        if (processed >= total) break;
        page++;
        items = (await fetchPage(ctid, page)).items;
      }
      if (LOCALE === 'KO') {
        console.log(`[type ${ctid}] upsert ${upserted}, skip ${skipped}`);
      } else {
        console.log(
          `[type ${ctid}] locale=${LOCALE} · byName ${byName} · byCoord ${byCoord} · skipped ${skipped}`,
        );
      }
      grandUpserted += upserted;
      grandByName += byName;
      grandByCoord += byCoord;
      grandSkipped += skipped;
    }
    if (LOCALE === 'KO') {
      console.log(`완료 — upsert ${grandUpserted}, skip ${grandSkipped}`);
    } else {
      console.log(
        `완료 — locale=${LOCALE} · byName ${grandByName} · byCoord ${grandByCoord} · skipped ${grandSkipped}`,
      );
    }
  } finally {
    await client.end();
  }
}

void main();
