import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import * as schema from '../schema';

/**
 * Seed static English names for the 17 시·도 (PROVINCE) regions into `region_trans`.
 *   pnpm seed:regions:en
 *
 * - TourAPI에는 안정적인 영문 시·도 명이 없어(EngService2 title은 관광지명이지
 *   행정구역명이 아님) 정적 매핑 테이블을 그대로 upsert한다.
 * - region 행이 없는 코드로 upsert하면 FK 위반이라, 먼저 `pnpm seed:regions`(KO)가
 *   실행되어 PROVINCE 행이 존재해야 한다 — 없으면 seed-regions.ts와 동일한 에러로 종료.
 *
 * env:
 *   DATABASE_URL   (필수)
 */
const PROVINCE_EN: Record<string, string> = {
  '1': 'Seoul',
  '2': 'Incheon',
  '3': 'Daejeon',
  '4': 'Daegu',
  '5': 'Gwangju',
  '6': 'Busan',
  '7': 'Ulsan',
  '8': 'Sejong',
  '31': 'Gyeonggi-do',
  '32': 'Gangwon-do',
  '33': 'Chungcheongbuk-do',
  '34': 'Chungcheongnam-do',
  '35': 'Gyeongsangbuk-do',
  '36': 'Gyeongsangnam-do',
  '37': 'Jeonbuk-do',
  '38': 'Jeollanam-do',
  '39': 'Jeju',
};

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL 이 설정되지 않았습니다 (.env 확인)');
    process.exit(1);
  }

  const client = postgres(dbUrl, { max: 1 });
  const db = drizzle(client, { schema });
  try {
    const provinceRows = await db
      .select({ code: schema.regions.code })
      .from(schema.regions)
      .where(sql`${schema.regions.level} = 'PROVINCE'`);
    const existing = new Set(provinceRows.map((r) => r.code));
    if (existing.size === 0) {
      throw new Error('PROVINCE region이 없습니다 — 먼저 `pnpm seed:regions` 실행');
    }

    const missing = Object.keys(PROVINCE_EN).filter((code) => !existing.has(code));
    if (missing.length > 0) {
      console.warn(`region 테이블에 없는 코드(skip): ${missing.join(', ')}`);
    }

    let seeded = 0;
    for (const [code, name] of Object.entries(PROVINCE_EN)) {
      if (!existing.has(code)) continue;
      await db
        .insert(schema.regionTrans)
        .values({ regionCode: code, locale: 'EN', name })
        .onConflictDoUpdate({
          target: [schema.regionTrans.regionCode, schema.regionTrans.locale],
          set: { name },
        });
      seeded++;
    }
    console.log(`region EN names seeded: ${seeded}`);
  } finally {
    await client.end();
  }
}

void main();
