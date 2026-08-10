## 하네스: 안정성 검토 (Stability Review)

**목표:** KIOST 정총무1.0 앱이 실사용 조건(모바일 브라우저, Vercel 서버리스 UTC, 무료 티어 한도)에서 조용히 틀린 결과를 내거나 멈추는 지점을 찾아낸다.

**트리거:** "안정성 검토", "stability review", "배포 전에 점검해줘", "다시 검토해줘" 등 요청 시 `stability-review` 스킬을 사용하라. 단순 질문은 직접 응답 가능.

**변경 이력:**
| 날짜 | 변경 내용 | 대상 | 사유 |
|------|----------|------|------|
| 2026-08-04 | 초기 구성 | `stability-reviewer` 에이전트 + `stability-review` 스킬 | 사용자가 안정성 전담 에이전트 요청 |

## 교통 정액 요금표(TRANS) 갱신

고속철도(KTX/기차)·승용·버스 구간별 정액 요금은 `TRANS/*.xls`(BUS.xls, CAR.xls, ktx.xls, train.xls)가 원본이고, 앱은 이걸 변환한 `src/data/transportFares.json`을 번들로 쓴다(런타임에 엑셀을 직접 읽지 않음).

**요금표가 갱신되면:**
1. 사용자가 새 엑셀 파일을 `TRANS/` 폴더의 같은 파일명으로 교체(또는 전달)
2. `npm run sync:fares` 실행 → `src/data/transportFares.json` 재생성
3. 평소처럼 typecheck/test/build 확인 후 배포(GitHub 웹에디터로 `TRANS/*.xls`와 `src/data/transportFares.json` 둘 다 함께 업로드)

원본 엑셀의 열 구조(교통편/구간/금액, 또는 교통편/구간/책임급/선임급이하)만 유지되면 코드 수정 없이 반영된다. 구조 자체가 바뀌면 `scripts/buildTransportFares.mjs`도 함께 손봐야 한다.
