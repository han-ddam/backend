# 홈 요약(화면1) — 설계 (2026-07-12)

## 목적

홈/지도 탭 상단 — 내 총점·전국 순위·전체 진행도(요약), 시·도별 진행 %(색칠), 오늘의 추천
여행지 3개. 대부분 기존 레이어(stats·dogam) 재사용, `discovery/today`만 신규 추천 로직.

## 범위 결정 (사용자 확정)

| 항목 | 결정 | 후속(비범위) |
|---|---|---|
| 엔드포인트 | `/me/summary` + `/me/progress/sido` + `/discovery/today` | — |
| summary | StatsService(점수·순위·총원) + DogamService.overview(진행도) | — |
| progress/sido | DogamService.regions에서 `locked` 제거 | — |
| discovery/today | **미방문 ACTIVE 장소, 날짜 시드 로테이션** | 개인화 추천(협업필터), place 대표이미지 |
| 접근 | 3개 모두 로그인(JwtAuthGuard, 개인화) | — |
| 신규 테이블 | 없음 | — |

## 아키텍처 — 신규 `src/modules/home/`

- **HomeController**: 3 라우트, JwtAuthGuard, `@CurrentUser`, `@ReqContext`(locale).
- **HomeService**: summary(stats+dogam 조립), progressSido(dogam.regions→locked 제거), discoveryToday(repo+이름 병합).
- **HomeRepository**: discovery 쿼리(미방문 date-seed) + place 이름/주소 배치. (summary/progress는 서비스 재사용이라 repo 불필요.)
- **home.module**: imports `AuthModule`(가드), `StatsModule`(StatsService), `DogamModule`(DogamService). app.module 등록.
- **StatsService 확장**: 누적 {score, nationalRank, totalUsers}를 노출하는 `summaryStats(userId)` 추가(현재 profile은 raw 누적점수를 안 줌; repo.myStats(CUMULATIVE) 재사용).

## API

성공은 `{result:...}`만. `@ApiOperation` summary 포함. 3개 모두 로그인.

### `GET /api/me/summary`
```jsonc
{ "result": {
  "score": 315, "nationalRank": 127, "totalUsers": 15284,
  "progress": { "percent": 63, "collected": 102, "total": 161 }
}}
```
- score/nationalRank/totalUsers = `StatsService.summaryStats(userId)`(CUMULATIVE). 미랭크(점수 0)면 score 0, nationalRank null.
- progress = `DogamService.overview(userId)` → {percent, collected, total}.

### `GET /api/me/progress/sido`
```jsonc
{ "result": [
  { "sidoCode":"1", "name":"서울", "percent":80, "collected":8, "total":10 }
]}
```
- `DogamService.regions(userId, locale)` 결과(17개, `Number(code)`순, locale/KO)에서 `locked` 필드만 제거.

### `GET /api/discovery/today?limit=3`
```jsonc
{ "result": [
  { "placeId":"uuid", "name":"영금정", "address":"강원특별자치도 속초시 ...", "imageUrl": null }
]}
```
- 미방문 ACTIVE 장소, 정렬 `md5(place_id::text || current_date::text)` → **하루 고정·매일 갱신**.
- 미방문 = `NOT EXISTS(visit v: v.place_id=p.id AND v.user_id=me)`.
- name/address = place_trans(locale, KO 폴백; 이름 없으면 '', address 없으면 null). imageUrl = 항상 null.
- `limit` 기본 3·범위 1~20. 미방문 장소 없으면 `{result:[]}`.

## HomeRepository (discovery)

```
discoveryToday(userId, limit): Promise<{ id: string }[]>
  SELECT p.id FROM place p
  WHERE p.status='ACTIVE'
    AND NOT EXISTS (SELECT 1 FROM visit v WHERE v.place_id = p.id AND v.user_id = ${userId})
  ORDER BY md5(p.id::text || current_date::text)
  LIMIT ${limit}
placeNames(placeIds, locales): Promise<{ placeId; locale; name; address }[]>  -- place_trans 배치
```
(regions/dogam repo의 placeTrans 배치 패턴과 동형; home 자체 구현으로 모듈 독립 유지.)

## 테스트

- **HomeService 단위**(stats/dogam/repo 모킹):
  - summary: 조립(score/rank/total/progress), 미랭크 시 nationalRank null.
  - progressSido: dogam.regions 결과에서 locked 제거된 형태.
  - discoveryToday: 아이템 매핑(imageUrl null, locale/KO 폴백, address null), 빈 목록, limit 전달.
- **StatsService.summaryStats 단위**(repo.myStats 모킹): {score, nationalRank, totalUsers} 매핑, 미랭크 null.
- discovery SQL(date-seed·미방문)은 빌드 + 정적 검증 + 수동 e2e (기존 관례).

## 비범위 (후속)

place 대표이미지(discovery imageUrl), 협업필터/개인화 추천, 지도 폴리곤, `/me/collections`,
여행지 상세 확장, discovery 캐싱.
