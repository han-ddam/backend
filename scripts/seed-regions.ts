import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../src/db/schema';

/**
 * Seed the `region` table (시·도 / 시·군·구) from TourAPI areaCode.
 *   pnpm seed:regions
 *
 * - 시·도   → code = areaCode,                parent_code = null
 * - 시·군·구 → code = `${areaCode}_${sigungu}`, parent_code = areaCode
 *   (TourAPI sigunguCode is only unique WITHIN an area, so we combine.)
 * - boundary(폴리곤)은 채우지 않음(추후 GeoJSON 적재). is_declining_pop는 기본 false.
 * - upsert라 재실행 안전.
 *
 * env:
 *   TOURAPI_KEY            (필수, data.go.kr 인증키 — Encoding 키 그대로)
 *   TOURAPI_AREACODE_URL   (선택, 기본 KorService2/areaCode2)
 */
const BASE =
  process.env.TOURAPI_AREACODE_URL ??
  'https://apis.data.go.kr/B551011/KorService2/areaCode2';
const KEY = process.env.TOURAPI_KEY;

interface AreaItem {
  code: string;
  name: string;
}

async function fetchAreas(areaCode?: string): Promise<AreaItem[]> {
  const params = new URLSearchParams({
    MobileOS: 'ETC',
    MobileApp: 'handdam',
    _type: 'json',
    numOfRows: '1000',
    pageNo: '1',
  });
  if (areaCode) params.set('areaCode', areaCode);
  // serviceKey는 이미 인코딩된 값일 수 있어 URLSearchParams로 다시 인코딩하지 않고 직접 붙임
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
  const items = data?.response?.body?.items?.item ?? [];
  const arr = Array.isArray(items) ? items : [items];
  return arr
    .filter((i) => i && i.code != null)
    .map((i) => ({ code: String(i.code), name: String(i.name) }));
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

  // 진단: 실제 사용하는 엔드포인트 + 키 미리보기(브라우저에서 쓴 값과 비교)
  console.log(`endpoint: ${BASE}`);
  console.log(
    `key: 길이 ${KEY.length}, ${KEY.slice(0, 4)}...${KEY.slice(-4)}`,
  );

  const client = postgres(dbUrl, { max: 1 });
  const db = drizzle(client, { schema });
  try {
    const sidos = await fetchAreas();
    if (sidos.length === 0) {
      throw new Error('시·도 목록이 비었습니다 — TOURAPI_KEY/URL 확인');
    }
    console.log(`시·도 ${sidos.length}개 수신`);

    // region(코드/구조) upsert + region_trans(KO 이름) upsert
    const upsertRegion = async (
      code: string,
      level: 'PROVINCE' | 'DISTRICT',
      parentCode: string | null,
      nameKo: string,
    ) => {
      await db
        .insert(schema.regions)
        .values({ code, level, parentCode })
        .onConflictDoUpdate({
          target: schema.regions.code,
          set: { level, parentCode },
        });
      await db
        .insert(schema.regionTrans)
        .values({ regionCode: code, locale: 'KO', name: nameKo })
        .onConflictDoUpdate({
          target: [schema.regionTrans.regionCode, schema.regionTrans.locale],
          set: { name: nameKo },
        });
    };

    let districtTotal = 0;
    for (const province of sidos) {
      await upsertRegion(province.code, 'PROVINCE', null, province.name);

      const districts = await fetchAreas(province.code);
      for (const d of districts) {
        await upsertRegion(`${province.code}_${d.code}`, 'DISTRICT', province.code, d.name);
      }
      districtTotal += districts.length;
      console.log(` - ${province.name}(${province.code}): district ${districts.length}`);
    }
    console.log(`완료 — province ${sidos.length}, district ${districtTotal}`);
  } finally {
    await client.end();
  }
}

void main();
