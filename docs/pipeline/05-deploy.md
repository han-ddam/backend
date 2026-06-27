# 한땀 — 배포 (GitHub Actions + Tailscale Funnel)

> main 푸시 → GitHub Actions가 이미지 빌드 → GHCR push → tailnet 서버 SSH → compose 배포.
> 유저 앱은 **Tailscale Funnel**의 `https://<host>.<tailnet>.ts.net`을 바라봄(도메인 0원).

## 1. 구성 개요

```
git push main
   │
[GitHub Actions]  (.github/workflows/deploy.yml)
   ├─ docker build → ghcr.io/<owner>/<repo>:<sha>,:latest
   ├─ tailscale up (ephemeral, tag:ci, OAuth)        # 비밀번호 X
   └─ ssh <tailnet-host> → scripts/deploy.sh
                                   │
        ┌──────────── tailnet 서버 (동적 공인IP 무관) ────────────┐
        │  compose.prod.yml:                                       │
        │    app(127.0.0.1:3000) ─ worker ─ redis ─ postgres+PostGIS│
        │    DB/Redis 비공개(내부망), app은 localhost만            │
        │  tailscale funnel 443 → localhost:3000                   │
        │     → https://<host>.<tailnet>.ts.net  ← 유저 앱이 바라봄 │
        └───────────────────────────────────────────────────────────┘
```

- 빌드: 멀티스테이지 `Dockerfile`(node:24-slim). app/worker 같은 이미지, command만 다름.
- 마이그레이션: 운영 이미지엔 drizzle-kit 미포함 → `node dist/db/migrate.js`(drizzle-orm 마이그레이터, `migrate:prod`). `deploy.sh`가 app 기동 전에 실행.
- 공인 IP가 바뀌어도 무관: Funnel은 서버에서 **나가는** 연결이라 포트포워딩/고정 IP 불필요.

## 2. 서버 1회 셋업

```bash
# 0) docker + compose, tailscale 설치 (생략)
# 1) tailnet 합류
sudo tailscale up --ssh            # (CI는 SSH키 사용. Tailscale SSH는 선택)
tailscale status                   # MagicDNS 이름 확인 → DEPLOY_HOST 로 사용

# 2) 배포 디렉터리 + .env (시크릿은 여기에만, git X)
mkdir -p ~/handdam && cd ~/handdam
cp /path/to/env.example .env       # 아래 "운영 .env" 채우기
mkdir -p docker/initdb scripts      # CI가 compose.prod.yml/deploy.sh/initdb 를 scp

# 3) CI 배포용 SSH 공개키 등록 (DEPLOY_SSH_KEY 의 pub)
#   echo "<pubkey>" >> ~/.ssh/authorized_keys

# 4) 최초 배포 후 1회: 앱을 공개(Funnel)
sudo tailscale funnel --bg 3000    # → https://<host>.<tailnet>.ts.net (443)
sudo tailscale funnel status
```

### 운영 `.env` (서버에만)
| 키 | 값 | 비고 |
|---|---|---|
| `NODE_ENV` | `production` | |
| `PORT` | `3000` | compose가 127.0.0.1:3000 매핑 |
| `POSTGRES_USER/PASSWORD/DB` | 강한 비번 | postgres 컨테이너 초기화 |
| `DATABASE_URL` | `postgres://<user>:<pw>@postgres:5432/<db>` | **host=`postgres`**(서비스명) |
| `REDIS_URL` | `redis://redis:6379` | **host=`redis`** |
| `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` | 새로 생성 | `change-me-*` 금지 |
| `TOURAPI_KEY` | data.go.kr 키 | 시드/동기화 |
| `CORS_ORIGINS` | 앱이라 보통 `*` 또는 미사용 | |

## 3. GitHub Secrets (Settings → Secrets and variables → Actions)

| Secret | 설명 |
|---|---|
| `TS_OAUTH_CLIENT_ID` / `TS_OAUTH_SECRET` | Tailscale **OAuth client**(admin → Settings → OAuth). ACL에 `tag:ci` 정의 필요 |
| `DEPLOY_HOST` | 서버 tailnet 이름 또는 `100.x.x.x` |
| `DEPLOY_USER` | 서버 SSH 유저 |
| `DEPLOY_DIR` | 배포 디렉터리(예: `/home/<user>/handdam`) |
| `DEPLOY_SSH_KEY` | 배포용 **개인키**(서버 authorized_keys에 공개키 등록) |
| `GITHUB_TOKEN` | 자동 제공 — GHCR push/pull(이미지 권한) |

> Tailscale ACL에 CI 태그 한 줄: `"tagOwners": { "tag:ci": ["autogroup:admin"] }`.
> SSH키 대신 **Tailscale SSH**를 쓰려면 ACL의 `ssh` 규칙으로 `tag:ci` → 서버 유저 허용 후
> 워크플로의 SSH키 단계를 `tailscale ssh`로 교체(선택).

## 4. 배포 흐름 (자동)

`main` 푸시(또는 Actions에서 수동 `workflow_dispatch`):
1. 이미지 빌드 → GHCR push (`:sha`, `:latest`)
2. 러너가 tailnet 합류(ephemeral)
3. `compose.prod.yml`·`deploy.sh`·`docker/initdb` 서버로 scp
4. 서버에서 `deploy.sh`: GHCR 로그인 → `pull` → **migrate** → `up -d` → prune

### 수동/롤백
```bash
# 서버에서
cd ~/handdam
APP_IMAGE=ghcr.io/<owner>/<repo>:<원하는-sha> bash scripts/deploy.sh
```

## 5. 앱(프론트) base URL — ⚠ 주의
- 앱은 `https://<host>.<tailnet>.ts.net` 을 API base로 사용.
- 하드코딩 시 서버 이전하면 **스토어 재배포** 필요 → **base URL을 원격설정**(remote config/간단한 JSON 엔드포인트)으로 빼두길 권장. 나중에 도메인 붙이면 그 값만 교체.

## 6. 주의/한계
- Funnel은 443/8443/10000만, 트래픽이 Tailscale 릴레이 경유(약간 지연) — MVP/초기 적합. 대규모 시 도메인+Cloudflare Tunnel 또는 VPS로 전환.
- DB/Redis 포트 **공개 금지**(compose.prod는 미발행). 백업: `pg_dump`는 tailnet 내부에서.
- 유저 실시간 GPS=개인위치정보 → 근접판정만, 원본 미저장(위치정보법, `04-data-sources.md`).
