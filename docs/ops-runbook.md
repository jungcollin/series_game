# 운영 런북 (SG-039)

이 문서는 로컬/스테이징에서 마이그레이션과 복원을 **어떻게 검증할지**만 적는다. 운영 DB에 접속했거나 복원 훈련을 끝냈다는 뜻이 아니다.

## 마이그레이션

1. `0001_init.sql` 다음에 `0002_community_ops.sql`을 적용한다.
2. 기존 `leaderboard_runs`, `stage_votes`, `stage_comments`를 삭제하지 않는다.
3. 앱을 먼저 롤백할 수 있어야 한다. `RANKED_WRITES_V2` 기본값은 꺼짐이다.
4. 검증: 빈 DB와 스냅샷 복사본에서 `npm run db:migrate --prefix relay-api` 후 테이블 존재·건수 확인.
5. 운영 `NODE_ENV=production`은 `TRUST_RELAY_CLIENT_IP` 기본값이 켜짐이다. Caddy가 넣는 `X-Relay-Client-IP`만 신뢰하고, `CF-Connecting-IP` / `X-Forwarded-For`는 쓰지 않는다. 프록시 헤더가 없으면 모든 쓰기가 하나의 `unknown` 버킷으로 묶인다.
6. `ANALYTICS_INGEST`와 `RANKED_WRITES_V2` 기본값은 꺼짐이다. 제작자 통계는 `CATALOG_PATH`(없으면 저장소 `content/catalog.json`)의 GitHub 매핑만 사용한다. 호출자가 `stages` 목록을 고를 수 없다.

## 백업·복원

운영 복원 훈련은 **미실행**. 완료로 표시하지 않는다.

복원 후 확인할 것:

- `leaderboard_runs` 건수와 대표 `run_id`
- `stage_votes` / `stage_comments` 건수
- `challenge_runs`가 비어 있거나 스냅샷과 일치
- 앱이 구버전으로도 읽기 가능한지

백업 파일이 있다는 것만으로 복원 완료로 치지 않는다.
