## 변경

-

## 스테이지 PR

한 PR에 스테이지 하나만 넣습니다. 해당없으면 이 절은 지워도 됩니다.

- slug:
- 장르:
- 조작법:
- 클리어 조건:
- 실패 조건:
- [ ] `community-stages/<slug>/index.html`과 `meta.json`이 있습니다
- [ ] 로컬 `python3 -m http.server 4173`에서 플레이해 봤습니다
- [ ] 코드와 에셋을 공개 배포할 권리가 있습니다

## 호스트 / API PR

해당없으면 이 절은 지워도 됩니다.

- [ ] `npm test` 통과
- [ ] API를 바꿨으면 `npm run test:api`와 `npm run typecheck --prefix relay-api` 통과
- [ ] 호스트 UI를 바꿨으면 `check_host_flow.js`도 실행
