# 한땀 백엔드 — 기획·설계 종합 (Overview & Roadmap)

> 기획/설계 단계의 **전체 그림 · 결정 로그 · 진행 방법 · 현재 상태**를 한 곳에 모은 마스터 문서.
> 세부는 아래 문서 맵 참고. (이 문서가 시작점)

## 1. 개요
- **제품**: 사진/그림으로 채우는 대한민국 시·군·구 여행 도감 — 인증→도감·챌린지·랭킹·공모전 게이미피케이션.
- **스택**: NestJS · Drizzle ORM · PostgreSQL(PostGIS) · Redis · BullMQ
- **클라이언트**: React Native 앱(회원) + 관리자 웹(별도)
- **구조**: 모듈러 모놀리스, 단일 앱 2 엔트리포인트(API/worker)

## 2. 문서 맵
| 문서 | 내용 |
|---|---|
| `00-overview.md` (이 문서) | 종합·결정로그·로드맵·현재상태 |
| `01-planning.md` | 요구사항(FR), 화면(Figma) 반영 |
| `02-design.md` | 아키텍처, 데이터모델, §12 추가설계(점수/이미지/컬렉션/약관) |
| `docs/api-spec.md` (+ `.svg`) | 화면별 API 명세 |
| `docs/db-erd.svg` | ERD(현재 구현된 스키마) |

## 3. 핵심 결정 로그 (Decision Log)
| 결정 | 내용 | 이유 |
|---|---|---|
| ORM | **Drizzle** (Prisma 아님) | PostGIS raw `sql\`\`` 1급 지원, 지오스페셜 핵심 |
| 인증 분리 | **회원 ↔ 관리자 완전 분리** (테이블/JWT(typ)/가드) | 백오피스와 소비자앱 성격 다름 |
| 관리자 역할 | **SUPER_ADMIN / ADMIN 2종** | MODERATOR/CURATOR 불필요(2종 충분) |
| 소셜 로그인 | **KAKAO · NAVER · GOOGLE** 3종 | Figma 로그인(카카오/구글) + 네이버 |
| 회원 | 소셜 전용(비번 없음), admin만 이메일/비번 | 공개 이메일가입 없음 |
| 클라이언트 헤더 | **X-Client 제거**, locale만 | RN이라 ios/android 구분 불필요 |
| i18n | **콘텐츠 테이블마다 `<table>_trans`** (admin·유저생성물 제외) | 다국어(영/일/중), 언어 추가=행 추가 |
| 행정구역 | `region.level`(**PROVINCE/DISTRICT**) generic 네이밍, `region_trans` | 한국 한정 용어(sido) 회피·확장성 |
| 점수 | **확장형**: rule·multiplier·event(원장)·level·badge, 데이터 기반 | 게이미피케이션 코드 배포 없이 확장 |
| 점수 가중치 | base × ∏(지역·희소도·시즌·이벤트) | 곱연산 stack |
| 이미지 | **원본 + 리사이즈** 2벌 | 보관/공모전(원본) vs 피드/공개(저용량) |
| 컬렉션 | M:N `collection_slot.seq`(순서), 테마=컬렉션 속성 | 도감 지역별/테마별 + 정렬 |
| 약관 | i18n, 로딩(TOS/개인정보)·인증(콘텐츠 라이선스) 2시점 | 창작자 저작권 보유 + 출처표기 라이선스 |
| 인증 신뢰 | 서버기록 디바이스GPS 1차, EXIF 불신, 구도매칭 체크 | 위변조 방지 |
| 데이터 출처 | region=시드(TourAPI areaCode), spot=TourAPI 동기화 | region은 정적, spot은 주기 동기화 |
| 마이그레이션 | 대화형 회피 위해 필요시 **수기 작성** + snapshot 동기화 | drizzle-kit 대화형 프롬프트 한계 |
| Figma 다이어그램 | MCP 미사용(유료) → **Mermaid/SVG 복붙·import** | |

## 4. 진행 로드맵 + 현재 상태
### ✅ 구현 완료
- platform (config/Drizzle/Redis/Id/Clock/RequestContext=locale)
- auth (회원 소셜 로그인: 카카오/네이버 ✅, 구글 🔜) + JWT/가드
- admin (별도 도메인: 이메일 로그인 + 회원/관리자 관리)
- geo + region (PostGIS, level/region_trans) + 시드(seed:regions, seed:admin)
- 보안(helmet/CORS/Redis rate-limit/JWT HS256/리프레시 재사용탐지/로그인잠금)
- Swagger(/api-docs)

### 🔜 다음(짧음)
- **Google OAuth 어댑터** (enum GOOGLE 추가됨 → 어댑터/엔드포인트만)

### 📐 설계 완료 · 미구현 (빌드 순서)
1. **places + ingestion** — TourAPI 관광지 동기화, 캐노니컬 매처, `place(+trans)`, 태그/평점/구도(`place_composition`)
2. **certification + scoring** — 인증(GPS·구도·caption·공개) + 점수 원장(score_event) + 가중치
3. **collections + progress** — 도감(컬렉션 M:N seq, 진행도 2축)
4. **challenges + rankings** — 챌린지, 랭킹(점수)/percentile/뱃지
5. **discovery + suntime / recommendations** — 추천·골든아워
6. **reviews / social / notifications**
7. **contests + consent / illustration / agreements**

## 5. 미결 / 오픈 이슈
- 인구감소지역 **89개 목록**(가중치 매핑) — 행안부
- region **boundary 폴리곤** 소스(GeoJSON + 법정동코드 브리지)
- **외국어 지역명**(영/일/중) — TourAPI 언어 서비스 활용신청 후 region_trans 보강
- 도감 **잠금(locked) 해금 조건**
- 약관 **법무 문구**(상업적 이용·철회 등), 동의 4단계 정의(Q1/Q5)
- 점수/EXP 환산식, 레벨 곡선(`level_policy`) 구체값
