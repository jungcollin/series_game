# relay-api

투표, 댓글, 스테이지 랭킹, 익명 세션을 담당하는 Hono + Postgres 서버입니다. 브라우저 클라이언트는 `community-stages/relay-api.js`가 `https://relay-api.collinworks.dev`로 붙습니다.

프로덕션 Caddy/compose/프로비저닝 스크립트는 이 저장소에 없습니다. 배포 호스트에만 둡니다.

## 로컬 실행

Node.js 22 이상, Postgres가 필요합니다.

```bash
cp .env.example .env
# DATABASE_URL 을 로컬 Postgres에 맞게 수정
npm ci
npm run db:migrate
npm run dev
```

기본 포트는 `8798`입니다. `GET /v1/health`가 살아 있으면 기동된 것입니다.

```bash
npm test
```

`.env`와 세션 시크릿은 커밋하지 마세요. 프로덕션 `SESSION_SIGNING_SECRET`은 32자 이상이어야 합니다.
