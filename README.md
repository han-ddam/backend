# 한땀 (han-ddam) — backend

NestJS · Drizzle ORM · PostgreSQL(PostGIS) · Redis · BullMQ

## 요구사항
- Node **24+**, pnpm **9+**
- Docker Desktop (실행 중이어야 함)

## 실행 방법

```bash
# 1. 의존성 설치
pnpm install

# 2. 환경변수 파일 준비
#    .env 파일은 백엔드 개발자에게 요청해 프로젝트 루트에 둡니다.

# 3. 인프라 기동 (PostgreSQL+PostGIS / Redis)
pnpm infra:up

# 4. DB 마이그레이션 적용
pnpm db:migrate

# 5. 서버 실행
pnpm start:dev        # API (http://localhost:3000/api)
pnpm worker           # (별도 터미널) 백그라운드 워커
```

확인: `curl http://localhost:3000/api/health`

## 자주 쓰는 명령
```bash
pnpm infra:down       # 인프라 중지
pnpm db:generate      # 스키마 변경 후 마이그레이션 생성
pnpm db:studio        # DB GUI (브라우저)
pnpm build            # 프로덕션 빌드
pnpm test             # 테스트
```
