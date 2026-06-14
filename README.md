# 한땀 (han-ddam) — Backend

사진과 그림으로 채우는 **대한민국 시·군·구 여행 도감** 서비스의 백엔드 API 서버입니다.
사용자가 장소를 방문해 사진으로 인증하면 지역·테마 도감이 채워지고, 챌린지·랭킹·공모전으로
이어지는 게이미피케이션 관광 플랫폼입니다.

**기술 스택:** NestJS · Drizzle ORM · PostgreSQL(PostGIS) · Redis · BullMQ

---

## 요구사항

| 항목 | 버전 | 비고 |
|---|---|---|
| Node.js | **24+** | `nvm install 24 && nvm use 24` 권장 |
| pnpm | **9+** | `corepack enable` 로 활성화 가능 |
| Docker Desktop | 최신 | PostgreSQL/Redis를 컨테이너로 띄움 (직접 설치 불필요) |

> PostgreSQL을 로컬에 따로 설치할 필요가 없습니다. Docker로 PostGIS 컨테이너를 띄웁니다.

---

## 시작하기

```bash
# 1. 의존성 설치
pnpm install

# 2. 환경변수 파일(.env) 준비
#    .env 파일은 백엔드 개발자에게 요청해 프로젝트 루트에 둡니다.
#    (DB 접속 정보, Redis 주소, JWT 시크릿 등이 들어 있습니다.)

# 3. 인프라 기동 — PostgreSQL(PostGIS) + Redis 컨테이너
pnpm infra:up

# 4. DB 마이그레이션 적용 — 테이블/확장/인덱스 생성
pnpm db:migrate

# 5. 초기 데이터 시드 (로컬 테스트용) — 아래 "초기 데이터 시드" 참고

# 6. 서버 실행
pnpm start:dev        # API 서버 (개발 모드, 코드 변경 시 자동 재시작)
pnpm worker           # (별도 터미널) 백그라운드 작업 워커
```

정상 동작 확인:

```bash
curl http://localhost:3000/api/health
# -> PostGIS 버전과 Redis 상태가 보이면 DB·캐시·서버가 모두 정상입니다.
```

> Docker Desktop이 **실행 중**이어야 `pnpm infra:up` 이 동작합니다.

### 초기 데이터 시드 (로컬 테스트용)

마이그레이션 직후 DB는 비어 있습니다. 로컬에서 기능을 테스트하려면 아래 두 가지를 넣어두면 좋습니다.

```bash
# (1) 최초 관리자 계정 — 관리자 로그인/회원·관리자 관리 테스트용
pnpm seed:admin <이메일> <비밀번호8자+> <이름>
#   예: pnpm seed:admin admin@handdam.dev Admin1234 관리자
#   → POST /api/admin/auth/login 으로 로그인해 토큰 발급

# (2) 지역(시·도/시·군·구) — 지도/도감의 지역 단위
pnpm seed:regions
#   → TourAPI에서 17개 시·도 + 약 229개 시·군·구를 region 테이블에 적재
#   ⚠️ .env 에 TOURAPI_KEY 필요 (data.go.kr "한국관광공사_국문 관광정보 서비스_GW" 활용신청 후 Encoding 인증키)
#   키가 KorService1용이면 .env 에 TOURAPI_AREACODE_URL 로 엔드포인트 교체 (env.example 참고)
```

> 두 시드 모두 **재실행해도 안전**합니다(중복 체크/upsert). admin 시드는 같은 이메일이면 막힙니다.
> 시드 확인: `pnpm db:studio` 또는 DB GUI에서 `admin` / `region` 테이블 조회.

### API 문서 (Swagger)

서버 실행 후 브라우저에서 확인:

```
http://localhost:3000/api-docs
```

요청/응답 스키마를 보고 바로 호출해볼 수 있습니다. (운영 환경에서는 비활성화됩니다.)

### 보안

- **helmet**: 보안 HTTP 응답 헤더 적용 (CSP, `X-Content-Type-Options`, `X-Frame-Options`,
  `Strict-Transport-Security` 등) 및 `X-Powered-By` 노출 제거
- **CORS**: `.env`의 `CORS_ORIGINS`로 허용 출처 제어 (`*` = 전체)
- **Rate limit**: 기본 100req/분, 인증 엔드포인트는 10req/분 (무차별 대입 방지)
- **JWT** 인증(회원/관리자 토큰 분리) + 관리자 역할 기반 접근 제어
- 비밀번호 **argon2** 해싱, 리프레시 토큰 회전·재사용 탐지, 로그인 실패 잠금

---

## 환경변수(.env)

`.env`는 보안상 저장소에 올리지 않습니다. **백엔드 개발자에게 요청**해 받으세요.
대략 아래 항목들이 들어 있습니다.

| 키 | 설명 |
|---|---|
| `DATABASE_URL` | PostgreSQL 접속 URL |
| `REDIS_URL` | Redis 접속 URL |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | 토큰 서명 시크릿 |
| `PORT` | API 포트 (기본 3000) |

---

## 인증 API

회원(앱 사용자)과 관리자(백오피스)는 **테이블·인증·토큰이 완전히 분리**되어 있습니다.

### 회원 — 소셜 로그인 (카카오/네이버)
앱이 네이티브 SDK로 받은 access token을 서버로 보내면, 서버가 검증 후 우리 JWT를 발급합니다.
**첫 로그인 시 자동 회원가입**되며, 회원은 비밀번호가 없습니다(소셜 전용).

| 메서드 | 경로 | 설명 | 요청 본문 |
|---|---|---|---|
| POST | `/api/auth/oauth/kakao` | 카카오 로그인 | `{ "accessToken": "..." }` |
| POST | `/api/auth/oauth/naver` | 네이버 로그인 | `{ "accessToken": "..." }` |
| POST | `/api/auth/refresh` | 토큰 갱신 | `{ "refreshToken": "..." }` |
| POST | `/api/auth/logout` | 로그아웃 | `{ "refreshToken": "..." }` |
| GET | `/api/auth/me` | 내 정보 | `Authorization: Bearer <accessToken>` |

### 관리자 — 이메일/비밀번호 로그인
관리자는 별도 `admin` 테이블·전용 JWT를 씁니다. 공개 가입은 없고, **최초 관리자는 시드 스크립트**로 생성합니다.

```bash
pnpm seed:admin <email> <password> <name>   # 최초 SUPER_ADMIN 생성
```

| 메서드 | 경로 | 설명 | 권한 |
|---|---|---|---|
| POST | `/api/admin/auth/login` | 관리자 로그인 `{ email, password }` | - |
| POST | `/api/admin/auth/refresh` | 토큰 갱신 | - |
| POST | `/api/admin/auth/logout` | 로그아웃 | - |
| GET | `/api/admin/auth/me` | 내 정보 | 관리자 토큰 |

**관리자 관리** (`SUPER_ADMIN`)

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/admin/admins?page=&limit=&q=` | 관리자 목록(페이지네이션·검색) |
| GET | `/api/admin/admins/:id` | 관리자 상세 |
| POST | `/api/admin/admins` | 관리자 생성 |
| PATCH | `/api/admin/admins/:id` | 수정 `{ name?, role?, isActive? }` |

**회원 관리** (`ADMIN`, `SUPER_ADMIN`)

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/admin/members?page=&limit=&q=` | 회원 목록(페이지네이션·검색) |
| GET | `/api/admin/members/:id` | 회원 상세 |
| PATCH | `/api/admin/members/:id/status` | 정지/해제 `{ status: ACTIVE\|SUSPENDED }` |

> 정지(SUSPENDED)된 회원은 소셜 로그인이 차단됩니다.

이후 보호된 API는 헤더에 `Authorization: Bearer <accessToken>` 를 붙여 호출합니다.

---

## 자주 쓰는 명령

```bash
pnpm start:dev        # 개발 서버 (자동 재시작)
pnpm worker           # 백그라운드 워커
pnpm infra:up         # DB/Redis 컨테이너 기동
pnpm infra:down       # DB/Redis 컨테이너 중지
pnpm db:generate      # 스키마 변경 후 마이그레이션 SQL 생성
pnpm db:migrate       # 마이그레이션 적용
pnpm db:studio        # 브라우저 기반 DB 뷰어
pnpm build            # 프로덕션 빌드
pnpm test             # 테스트
```

---

## DB 접속

로컬 DB는 Docker 컨테이너로 돌고, 호스트의 `localhost:5432`로 접속합니다.

| 항목 | 값 (로컬 기본) |
|---|---|
| Host | `localhost` |
| Port | `5432` |
| Database | `handdam` |
| User / Password | `.env` 참고 |

- **터미널(설치 불필요):** `docker exec -it handdam-postgres psql -U handdam -d handdam`
- **GUI:** TablePlus / DBeaver / DataGrip 등에서 **PostgreSQL** 드라이버로 위 정보 입력
  (※ Sequel Ace는 MySQL 전용이라 접속 불가)
- **웹:** `pnpm db:studio`

---

## 트러블슈팅

| 증상 | 해결 |
|---|---|
| `pnpm infra:up` 이 안 됨 | Docker Desktop이 실행 중인지 확인 |
| DB 접속 실패 | `pnpm infra:up` 후 컨테이너가 떴는지 `docker ps` 로 확인 |
| `Unsupported engine: node` 경고 | Node 24로 전환 (`nvm use 24`) |
| 포트 5432/3000 충돌 | 기존에 떠 있는 Postgres/프로세스 종료 후 재시도 |
