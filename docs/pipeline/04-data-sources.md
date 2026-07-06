# 한땀 — 데이터 출처 & 시드 현황 (Data Sources & Seeding)

> 좌표·경계·지역 등 **참조 데이터를 어디서 가져오고, 지금 무엇이 채워졌는지** 한 곳에서 확인.
> 코드로 적재되는 데이터(시드/동기화)만 다룬다. 유저 생성물(인증샷 등)은 제외.

## 1. 한눈에 — 무엇을 어디서 채우나

| 대상 | 컬럼/테이블 | 1차 출처 | 보조 | 비고 |
|---|---|---|---|---|
| 지역 목록(시·도/시·군·구 이름) | `region`, `region_trans` | **TourAPI** areaCode2 | — | 코드/구조 + KO 이름 |
| **지역 경계(폴리곤)** | `region.boundary` (MultiPolygon) | **vworld / SGIS** 행정경계 GeoJSON | — | GPS→지역 판정(`ST_Contains`)에 필요 |
| 지역 대표점(필요시) | (별도 컬럼 없음) | `boundary`에서 `ST_Centroid` 파생 | — | 점 좌표 따로 저장 안 함 |
| **관광지 좌표·메타** | `place`, `place_trans` | **TourAPI** areaBasedList2 (mapx/mapy) | vworld 지오코딩(주소→좌표) | 좌표·이름·주소 |

### 핵심 — 한 소스로는 다 못 채운다
- **vworld/SGIS** = 지역 경계 전용. 관광지 좌표는 안 줌.
- **TourAPI** = 관광지 좌표·메타 전용. 지역 경계는 안 줌.
- 두 소스는 서로 다른 테이블을 채우므로 **둘 다 필요**. vworld 지오코딩은 TourAPI 좌표 누락분 보완용(보조).

## 2. 시드 스크립트 (현재 존재)

| 명령 | 스크립트 | 채우는 것 | env |
|---|---|---|---|
| `pnpm seed:admin <email> <pw> <name>` | `scripts/seed-admin.ts` | 첫 SUPER_ADMIN 계정 | DATABASE_URL |
| `pnpm seed:regions` | `src/db/seeds/seed-regions.ts` | `region`+`region_trans` (TourAPI areaCode2) | TOURAPI_KEY |
| `pnpm seed:places` | `src/db/seeds/seed-places.ts` | `place`+`place_trans` 좌표/이름/주소 (TourAPI areaBasedList2) | TOURAPI_KEY |

> regions/places 시드는 `src/db/seeds/`에 있어 **운영 이미지로도 컴파일**됨(`node dist/db/seeds/*.js`). 배포 시 `.env`의 `SEED_ON_DEPLOY=1`이면 `deploy.sh`가 regions→places 순으로 실행(`05-deploy.md` §4).

- 모두 **upsert**(재실행 안전). `seed:places`는 `tourapi_content_id` 기준.
- `seed:places` 옵션 env: `TOURAPI_CONTENT_TYPE_IDS`(기본 `12`=관광지, 콤마구분), `TOURAPI_PLACE_ROWS`(페이지당, 기본 100), `TOURAPI_PLACE_MAX`(타입별 최대, 테스트용).
- `region_code = ${areaCode}_${sigungu}` 규칙으로 매핑. region에 없는 코드는 FK 보호로 skip. 좌표(mapx/mapy) 없는 항목도 skip.

## 3. 현재 적재 상태 (2026-06 기준)

| 데이터 | 상태 | 수치 |
|---|---|---|
| region (PROVINCE/DISTRICT) | ✅ 적재됨 | DISTRICT 234개 |
| region.boundary (폴리곤) | ❌ **비어있음** | 0 / 미구현 |
| place 좌표 + KO 이름/주소 | ✅ 적재됨 | 7,860행 (전부 좌표 보유) |
| place 다국어(EN/JA/ZH) | ❌ 미구현 | KO만 |

> `seed:places` 첫 실행: TourAPI 관광지(type 12) totalCount 12,676 → upsert 7,860 / skip 4,816(좌표 없음 또는 DISTRICT 미존재).

## 4. 구현 현황

| 항목 | 코드 | 상태 |
|---|---|---|
| TourAPI 지역 시드 | `seed-regions.ts` | ✅ |
| TourAPI 관광지 좌표 시드 | `seed-places.ts` | ✅ |
| vworld/SGIS 경계 적재 | — | ❌ 미구현 (스키마·GIST 인덱스만 준비) |
| vworld 지오코딩 보완 | — | ❌ 미구현 (선택) |
| 관광지 정기 동기화 worker(ingestion-sync) | — | ❌ 미구현 (현재는 수동 시드) |

## 4.5 재시드 정합성 (SEED_ON_DEPLOY / 반복 실행 시)

- ✅ **FK 안전** — place는 `tourapi_content_id` 기준 upsert라 **행 uuid 보존** → 인증·컬렉션의 place FK 안 깨짐. 삭제도 안 함(사라진 관광지는 stale로 남을 뿐).
- ✅ **어드민 큐레이션 보존** — 시드는 `lat/lng/region_code`만 갱신, `base_points`·`rarity_weight`·`tags`·`status` 미변경. `place_trans`도 `name`·`address`만 갱신(`description`·`mission` 미변경).
- ⚠️ **이름/주소(KO) 덮어씀** — 어드민이 이름/주소를 편집했다면 재시드 시 TourAPI 값으로 되돌아감. (편집 보호는 추후 플래그/필드분리)
- ⚠️ **진행도 분모 변동** — 새 place 유입 시 도감 진행률 %가 내려감(의미적). → 그래서 **매 배포 무조건 시드 X, 플래그로 의도했을 때만**.
- ⚠️ **stale place** — TourAPI에서 사라진 관광지는 `ACTIVE`로 잔존. 추후 "이번 시드에 없으면 HIDDEN" 정리 여지.
- 📌 **미결정** — 시드 place를 전부 `ACTIVE`(현재) vs `HIDDEN 후보 + 어드민 승격`. 현재는 전부 ACTIVE.

## 5. 남은 작업

- **region.boundary 시드** — vworld/SGIS 시군구 경계 GeoJSON → `region.boundary` 적재(수기 SQL 마이그레이션 + GIST). **단, place 중심 동선에선 불필요**(지역은 place.region_code에서 파생) — 자유 인증(등록 place 없이 GPS만으로 지역판정) 도입 시에만 필요.
- **place 다국어** — TourAPI 언어별 서비스(EngService2/JpnService2/ChsService2)로 `place_trans` EN/JA/ZH 보강.
- **정기 동기화** — 수동 시드 → `ingestion-sync` worker(스케줄)로 승격(신규/변경 반영).
- **법무** — 유저 실시간 GPS는 개인위치정보(위치정보법). 참조 데이터(vworld/TourAPI)는 규제 무관. 근접 판정에만 쓰고 원본 좌표 미저장 방향 → 법무 확인.

## 6. 위치정보법 메모 (요약)

- **참조 데이터**(서버가 미리 적재한 region 경계, place 좌표) = 규제 무관.
- **유저 실시간 GPS** = 개인위치정보 → 위치기반서비스(LBS) 신고 대상 가능성. 완화책: 근접 판정(`proximityPass`)에만 쓰고 디바이스 원본 좌표는 저장하지 않는 방향. 최종 법무 확인 필요.
