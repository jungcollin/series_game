# P0 baseline (SG-001)

작성: 2026-09-08  
계획 기준 커밋: `7f4aa478` (`feat: move ranking onto dedicated OCI API`)  
현재 HEAD: `ae2d407`  
검수 Node: `v22.22.1`  
P3(콘텐츠 보강·신규 3종)는 이 작업 범위에서 제외한다.

이 문서는 확인한 사실과 아직 확인하지 못한 항목만 적는다. 운영 이전·백업·부정행위 방지를 완료로 표시하지 않는다.

## 실행한 검사 (T01)

| 명령 | 결과 |
|---|---|
| `npm test` | 40/40 PASS |
| `npm run test:api` | 6/6 PASS |
| `npm run typecheck --prefix relay-api` | PASS |
| `npm run build --prefix relay-api` | PASS |
| `GET https://relay.collinworks.dev/` | HTTP 200 |
| `GET https://relay-api.collinworks.dev/v1/health` | HTTP 200, `{"ok":true,"service":"oneliferelay-api"}` |
| `GET https://relay-api.collinworks.dev/v1/ready` | HTTP 200, `{"ok":true}` |

T34(운영 DB 마이그레이션·백업 복원)와 운영 이미지 커밋 대조는 **미실행**. 서버에 접속하거나 백업을 복원하지 않았다.

## 기준 커밋 이후 이미 들어간 것

다시 만들지 않는다.

- `5a9974c` iframe sandbox, token-bound `postMessage`, 세션 토큰, 투표/댓글 쓰기의 bearer 소유권, 랭킹 POST `410`
- GitHub Pages는 `main`만 배포. `codex/local-relay-workflow` 트리거는 없음
- PR review 워크플로는 `contents: read`, `persist-credentials: false`, fork 코드를 임시 디렉터리에서만 실행
- 공개 트리에서 내부 기획 문서·운영 Caddy/compose를 제거. 배포 파일은 로컬 `relay-api/deploy/`에만 있고 gitignore

## 확인된 현재 동작

- 데일리 루트는 `daily-relay.js`의 고정 5개 ID를 KST 날짜 시드로 섞는다. 다섯이 없으면 registry 나머지로 채운다.
- 홈 로드 시 `startNewRun()`이 바로 호출된다. 시작 버튼 전에도 런이 시작된다.
- 로드 타임아웃(4초)은 해당 스테이지를 `unavailable`로 표시하고 건너뛸 수 있다. 건너뛴 뒤 남은 스테이지가 없으면 **ALL CLEAR**로 처리한다. `clearCount`가 5가 아니어도 완주로 보인다.
- `cleared`는 `gameover`/`complete`에서만 무시한다. `transition` 중 두 번째 `cleared`는 시간을 다시 더한다. `failed`는 종료 상태 검사가 없다.
- 전체/스테이지 랭킹 쓰기는 410. 기존 기록은 읽기 전용, `verified: false`
- `finished_all_clear`는 `Boolean(...)` 변환이 남아 있으나, 해당 POST는 이미 410이라 신규 저장 경로에서는 쓰이지 않는다
- rate limit은 프로세스 메모리 + `X-Relay-Client-IP`. 다중 인스턴스 전역 제한은 없다
- `main` 보호: PR 리뷰 필수 인원은 0, admin enforce 없음. `git push`가 보호 규칙을 bypass하고 들어간다
- Pages 배포 job 안에 `npm test` / API 테스트는 없다

## 미확인

- 운영 컨테이너가 `ae2d407`인지, 그 이전 API 커밋인지
- 운영 Postgres 마이그레이션 적용 범위와 백업·복원 절차
- 예전 Supabase 프로젝트의 쓰기 권한 잔존 여부
- 실제 기기 Safari/Chrome 검수 (T40)

확인 전에는 UI나 문서에 “이전 완료”, “운영 정책 정상”, “부정행위 방지 완료”를 쓰지 않는다.

## 다음 작업

SG-002·SG-003·SG-004·SG-005는 이 기준선 위에 진행했다. 다음 P0는 SG-006(세션 소유권 잔여 계약), SG-007, SG-008이다.  
전체 계획 원문은 저장소 밖에 둔다. 공개 트리에 1600줄 로드맵을 다시 넣지 않는다.

## 바꾸지 않을 것 (이번 P0)

- Vanilla 호스트 + Hono/Postgres API 스택
- 이미 있는 세션 토큰·랭킹 410·iframe sandbox를 다른 스택으로 교체
- P3 신규 게임 3종·기존 6개 콘텐츠 보강
