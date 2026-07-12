# 점수/EXP/랭킹 집계 레이어 — 설계 (2026-07-12)

## 목적

`score_event` 원장을 소비해 사용자 누적 점수·EXP·레벨·전국 랭킹을 계산하고, 마이페이지
프로필(`/me/profile`)과 랭킹 탭(`/rankings`)에 제공. 홈 요약·컬렉션은 후속.

## 범위 결정 (사용자 확정)

| 항목 | 결정 | 후속(비범위) |
|---|---|---|
| 계산 방식 | **실시간 SQL**(SUM + window RANK) | Redis ZSET |
| EXP/레벨 | EXP = weightedScore 누적, level = **코드 임계치 공식** | level_policy 테이블 |
| 엔드포인트 | `/me/profile` + `/rankings` | `/me/summary`, `/me/collections`(컬렉션 모델) |
| badge | 항상 null | 뱃지 체계 |
| 신규 테이블 | 없음 (score_event 조회) | user_stat 집계 |

## 정책

- **점수 SSOT**: 점수/EXP/랭킹은 `score_event.weighted_score`의 프로젝션(원장에서 재구성 가능).
- **점수 0 제외**: 인증(=score_event) 없는 유저는 랭킹·totalUsers에서 제외.
- **MONTHLY**: 이번 달 = `created_at >= date_trunc('month', now())` (서버 UTC).
- GPS·개인정보 없음(집계만).

## 레벨 공식 (`src/modules/stats/level.ts`, 순수 함수)

```ts
// 누적 EXP → { level, exp, expForNextLevel }
// threshold(L) = 레벨 L 도달에 필요한 누적 EXP (증가 곡선).
//   threshold(1)=0, 이후 레벨당 비용 상승. 구체 계수는 구현 시 확정+테스트.
//   예: threshold(L) = 50 * (L-1) * L  → 1:0, 2:100, 3:300, 4:600 ...
// level = threshold(L) ≤ totalExp < threshold(L+1) 인 최대 L (최소 1)
// exp = totalExp - threshold(level)            // 현재 레벨 내 진행
// expForNextLevel = threshold(level+1) - threshold(level)  // 현재 레벨 구간 크기
export interface LevelInfo { level: number; exp: number; expForNextLevel: number; }
export function levelFromExp(totalExp: number): LevelInfo;
```
- totalExp 0 → level 1, exp 0, expForNextLevel = threshold(2). "2450/3200" 표시 형태와 일치.

## API

성공은 `{result:...}`만. `@ApiOperation` summary 포함. 둘 다 로그인 필수(JwtAuthGuard).

### `GET /api/me/profile`
```jsonc
{ "result": {
  "handle":"@seoulriver", "displayName":"서울강물", "avatarUrl":null,
  "level":23, "exp":2450, "expForNextLevel":3200,
  "dogamPercent":63, "visitedCount":102,
  "nationalRank":127, "totalUsers":15284
}}
```
- handle/displayName = users. avatarUrl = null(컬럼 없음).
- level/exp/expForNextLevel = `levelFromExp(누적 weightedScore)`.
- dogamPercent = `DogamService.overview(userId).percent`, visitedCount = 그 `collected`.
- nationalRank = 내 CUMULATIVE 순위(점수 0이면 null), totalUsers = 점수>0 유저 수.

### `GET /api/rankings?scope=NATIONAL&period=CUMULATIVE|MONTHLY&cursor=&limit=`
```jsonc
{ "result": {
  "topPercent": 5,
  "top3":[ {"rank":1,"handle":"@a","score":9800,"badge":null} ],
  "leaderboard":{ "items":[ {"rank":10,"handle":"@x","score":320,"dogamPercent":12} ], "nextCursor":"..." },
  "me":{ "rank":127, "score":315, "dogamPercent":63, "pointsToNext":18 }
}}
```
- `scope`: NATIONAL만(지역 스코프 후속). `period`: CUMULATIVE(총합) | MONTHLY(이번 달 합). 기본 NATIONAL/CUMULATIVE.
- **점수**: period별 `sum(weighted_score)` per user(점수>0만).
- **RANK**: `RANK() OVER (ORDER BY score DESC)`를 전체 집합에 계산한 서브쿼리를 keyset 커서로 페이지네이션 → 절대 순위 유지.
  - 커서: `(score, userId)` 내림차순 keyset(동점은 userId로 tie-break). limit 기본 20·max 100.
- **top3**: 상위 3(rank 1~3). badge=null.
- **me**: 내 rank/score/dogamPercent + `pointsToNext`(바로 위 순위 점수 − 내 점수, 1위 또는 미랭크면 0). 내 점수 0 → rank null, score 0.
- **topPercent**: 내 rank 기준 상위 %(`round(rank/totalUsers*100)`), 미랭크면 null.
- 각 리더보드 item의 dogamPercent = 그 유저 도감 %(배치 조회).

## 아키텍처 — `src/modules/stats/`

- **`level.ts`**: 순수 레벨 공식.
- **`stats.repository.ts`**: 집계 SQL — 유저 누적/월간 점수, 랭킹 페이지(window RANK + keyset), 내 순위·점수, 위 순위 점수(pointsToNext), 총 랭커 수, 리더보드 유저들의 dogam %(배치). 점수>0 필터.
  - dogam % 배치: 유저별 방문 distinct / 전국 ACTIVE place — dogam repo와 동형 쿼리를 stats repo에 두거나(중복 최소), 리더보드 유저 수(≤100)만큼 계산.
- **`stats.service.ts`**: profile 조립(level+dogam+rank), rankings(top3/leaderboard/me/topPercent 조립), DogamService.overview 재사용(profile용).
- **`stats.controller.ts`**: `GET /me/profile`, `GET /rankings` (JwtAuthGuard, @CurrentUser).
- **`stats.module.ts`**: AuthModule(가드) + DogamModule(overview) import, DRIZZLE(@Global). app.module 등록.

## 테스트

- **level.ts 단위**: level 1 경계(exp 0), 레벨업 경계(threshold 직전/직후), 큰 EXP, exp/expForNextLevel 계산.
- **StatsService 단위**(repo/dogam 모킹): profile 조립(rank null 케이스 포함), rankings me/top3/leaderboard 매핑·pointsToNext(1위 0)·topPercent·빈 랭킹, period 전달.
- 집계 SQL(window/keyset/dogam 배치)은 빌드 + 정적 검증 + 수동 e2e (기존 관례).

## 비범위 (후속)

Redis ZSET, 지역 스코프 랭킹, 뱃지 체계, level_policy 테이블, `/me/summary`·`/me/collections`,
user_stat 집계 테이블, 리더보드 캐싱.
