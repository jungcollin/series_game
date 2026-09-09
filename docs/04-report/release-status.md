# 릴리스 상태 (SG-040)

작성: 2026-09-09
P3(기존 6개 보강·신규 3종·SG-037 행사)는 제외했다.

## 확인

- P0 SG-001~008: 호스트 런 정책, idle 시작, 입력 검증, Pages verify 게이트, 세션 폐기, 신고/숨김/요청 ID, API 클라이언트 타임아웃
- 선택적 플레이 이벤트 수집 코드는 있으나, 운영 API ingest는 아직 켜지 않았다.
- P2: 갤러리 검색/필터/publishedAt, 로컬 즐겨찾기, 결과 화면 후속 행동, `?challenge=` 공유, play 메타·sitemap
- P4 일부: 제작자 페이지, 표본 숨김 집계 API, 템플릿/문서, 신고 UI
- 자동화: `npm test`, `npm run test:api`, catalog `--check`

## 미확인 · 부분

- 운영 API에 0002 마이그레이션·새 라우트 배포
- 운영 DB 백업 복원 훈련 (T34)
- 실기기 Safari/Chrome (T40)
- 20개 사람 재미 검수
- iframe `window.parent` 식별 비교 제거를 포함한 게임별 격리 전환. 호스트 sandbox는 유지
- `RANKED_WRITES_V2` 켜기. 켜기 전에 격리·세션·복원 증거가 필요하다
- 예전 Supabase 쓰기 잔존
- SG-037 주제형 행사 (P3 의존)

이 문서를 “고도화 공개 완료”나 “부정행위 방지 완료”로 인용하지 않는다.
