# 구글 앱스스크립트(GAS) 전환 검토

이 문서는 현재 Next.js/Prisma 기반 "국내여비 실비정산 도우미"를 Google Apps Script(GAS)로
옮기는 것이 실제로 효율적인지, 옮긴다면 어떤 구조가 되는지를 정리한다. 결론부터 말하면
**"코드를 그대로 포팅"하는 개념이 아니라 "같은 기능을 GAS 방식으로 다시 짜는" 수준의 작업**이다.
장단점을 먼저 보고 진행 여부를 결정하는 게 좋다.

---

## 1. 결론 요약

| 항목 | 지금 (Next.js + Prisma + Windows 로컬서버) | GAS로 전환 시 |
|---|---|---|
| 서버 유지 | 내 컴퓨터를 켜둬야 함(자동시작 스크립트로 임시 해결 중) | 불필요 — 구글이 호스팅 |
| 사내망 밖 접속 | 안 됨 (LAN IP만) | 됨 (구글 계정만 있으면 어디서든) |
| 여러 직원 접근/권한 | 없음(전부 공개, 최근 대화에서 "나중 문제"로 미룬 이슈) | **Workspace 도메인 제한으로 사실상 해결** |
| 이메일 발송 | 보류 중(개인 Gmail 우려로 코드만 만들고 비활성화) | **회사 계정으로 GmailApp 사용 → 바로 해결** |
| 데이터 저장 | SQLite(Prisma) | Google Sheets(+ Drive 파일) — 관계형 DB 아님 |
| PDF 다중 페이지 인식(mupdf/WASM) | 됨 | **GAS는 WebAssembly 미지원 → 이 기능 자체가 안 됨** |
| 한글 PDF 생성(pdf-lib+맑은고딕) | 됨(Windows 폰트 직접 사용) | Docs/Slides API로 대체(오히려 폰트 문제 해결됨) |
| 개발 편의성/디버깅 | 로컬에서 즉시 확인 가능 | clasp 배포 후 확인, 로그 확인 느림 |
| 실행시간 제한 | 없음 | 요청당 6분(개인 계정) / 30분(Workspace) |

**결론**: GAS는 "여러 직원이 안전하게 접근"과 "이메일 발송" 문제를 아주 자연스럽게 해결해주는
대신, "PDF/이미지 다중페이지 OCR"과 "관계형 데이터 모델" 부분은 다시 설계해야 한다. 즉 이번
대화에서 최근 미뤄뒀던 두 가지 열린 이슈(멀티유저 보안, 회사 이메일)를 정확히 해결해주는
플랫폼이라는 점에서 방향은 합리적이지만, **지금 코드베이스를 그대로 옮기는 건 불가능**하고
핵심 로직(판정 엔진, OCR 프롬프트, 룰테이블)만 재사용하고 나머지는 새로 짜야 한다.

---

## 2. GAS의 근본적인 제약 (반드시 먼저 알아야 할 것)

1. **파일시스템 없음** — `fs.readFile`, `public/uploads/...` 같은 로컬 파일 저장이 불가능.
   모든 파일은 Google Drive에 Blob으로 올려야 한다. (영수증 사진 보관 용도로는 오히려 Drive가
   적합하다 — 폴더 공유·검색·백업이 공짜로 따라온다.)
2. **WebAssembly 미지원** — 지금 다중 페이지 PDF 인식에 쓰는 `mupdf`(WASM)가 GAS에서 동작하지
   않는다. GAS 안에서 PDF의 특정 페이지만 이미지로 변환하는 방법이 사실상 없다(Drive API의
   썸네일 변환은 1페이지만 지원). → **PDF 영수증의 여러 페이지 인식 기능은 포기하거나 외부
   서비스(Cloud Run 등)에 위임**해야 한다.
3. **네이티브 npm 패키지 불가** — `@prisma/client`, `pdf-lib`, `@pdf-lib/fontkit`, `nodemailer`,
   `mupdf` 전부 GAS에서 못 쓴다. GAS는 순수 JS(또는 클래스릭 Rhino 시절 유물이 남은 V8 런타임)만
   돌린다. 외부 npm 패키지를 쓰려면 clasp로 번들링된 **순수 JS 코드만** 가능하고, 네이티브
   바인딩·WASM은 전부 배제된다.
4. **관계형 DB 없음** — SQLite/Prisma가 하던 일(트립-정거장-영수증 관계, 트랜잭션, cascade
   delete)을 Google Sheets 시트 3개(Trip/TripStop/Receipt)를 직접 행 단위로 다루는 코드로
   대체해야 한다. 트랜잭션이 없으므로 "정거장 전체 교체" 같은 로직은 직접 원자성을 신경 써서
   짜야 한다.
5. **실행시간/쿼터 제한** — 스크립트 1회 실행 최대 6분(무료 계정) / 30분(Workspace 계정),
   `UrlFetchApp`(OpenRouter 호출용) 하루 호출 횟수 쿼터 있음, 트리거 실행 총 시간도 하루 한도가
   있음. 지금처럼 OCR 실패 시 자동 재시도+지연(2.5초) 정도는 문제없지만, 대량 동시 사용은
   설계에 여유를 둬야 한다.
6. **UI 프레임워크 없음** — Next.js/React 서버 컴포넌트, Tailwind 빌드, App Router 라우팅이
   그대로 안 올라간다. GAS 웹앱은 `doGet()`이 HTML 한 장을 돌려주는 구조(`HtmlService`)이거나,
   프론트를 다른 곳(예: GitHub Pages 정적 사이트)에 두고 GAS를 순수 API 백엔드로만 쓰는 구조 중
   하나를 골라야 한다.

---

## 3. 그래도 GAS가 잘 맞는 부분

- **인증/권한**: 웹앱 배포 시 "액세스 권한: [회사 도메인] 내 모든 사용자"로 설정하면, 로그인한
  구글 계정 정보(`Session.getActiveUser().getEmail()`)를 코드에서 바로 쓸 수 있다. 지금 앱은
  로그인 개념이 아예 없어서 "최근 출장이 아무나 보임" 문제가 있었는데, 이게 기본으로 해결된다.
  → 데이터 모델에 `ownerEmail` 필드만 추가하면 "내 출장만 보기"가 자연스럽게 된다.
- **이메일**: `GmailApp.sendEmail()` / `MailApp.sendEmail()`은 배포 계정(회사 구글 계정)으로
  바로 발송된다. `.env`의 개인 Gmail 앱 비밀번호 걱정, SMTP 설정 전부 필요 없어진다. KIOST가
  Google Workspace 계정을 쓴다면 Phase 7에서 미뤄둔 문제가 그대로 해결.
- **PDF 생성(1페이지 영수증 기준)**: 지금은 `pdf-lib` + Windows에만 있는 `malgun.ttf`를 직접
  읽어서 폰트를 심는 방식이라 "이 PDF 생성은 Windows 환경 전용"이라는 제약이 있었다(PRD 열린
  이슈). Google Docs/Slides는 한글 폰트를 기본 지원하므로, 정산 결과를 Google Docs 템플릿에
  채워 넣고 `.getAs('application/pdf')`로 내보내면 이 문제가 아예 사라진다.
- **파일 보관**: Drive는 폴더 구조·검색·공유권한이 기본 제공이라 `public/uploads/<tripId>/...`
  수동 관리보다 오히려 관리가 편해진다(단, 다중 페이지 PDF의 페이지별 렌더링만 안 될 뿐).
- **배포/유지보수**: 서버를 켜둘 필요가 없다. Windows 시작프로그램 `.vbs` 스크립트로 억지로
  자동시작시키던 문제 자체가 없어진다.

---

## 4. 제안 아키텍처 (전환한다면)

```
[프론트엔드]
  - 옵션 A: GAS HtmlService (Apps Script 안에서 HTML+CSS+google.script.run으로 백엔드 호출)
  - 옵션 B: 정적 SPA(예: 지금 UI를 최대한 재사용해 Vite로 빌드) + GAS를 Web App API로만 사용
    (fetch로 GAS 배포 URL 호출). UI 자유도는 높지만 CORS/인증 처리가 조금 더 복잡해짐.
  → 지금 UI 완성도(애플 스타일, 아이콘, 다크모드 등)를 보면 "옵션 B"가 현실적.

[백엔드 - Apps Script 프로젝트]
  - Code.gs        : doGet/doPost 라우팅, 인증(Session.getActiveUser)
  - TripService.gs : 출장 CRUD (Sheets 행 단위)
  - ReceiptService.gs : 영수증 업로드(Drive 저장) + 판정 로직 호출
  - VerifyRules.gs : 지금 verifyReceipt.ts 로직을 그대로 이식 (순수 함수라 포팅 쉬움)
  - OcrService.gs  : UrlFetchApp으로 OpenRouter 멀티모달 API 호출 (지금 receiptOcr.ts 이식)
  - PdfService.gs  : Google Docs 템플릿 채우기 → PDF export
  - MailService.gs : GmailApp.sendEmail

[데이터 저장]
  - Google Sheets  : Trip / TripStop / Receipt 시트 (관계는 tripId로 텍스트 매칭)
  - Google Drive   : 영수증 원본 이미지, 생성된 정산 PDF

[외부 API]
  - OpenRouter 멀티모달 LLM(OCR) — 그대로 유지, UrlFetchApp으로 호출 방식만 바뀜
```

### 이식 난이도별 분류

| 현재 파일/기능 | 이식 난이도 | 비고 |
|---|---|---|
| `verifyReceipt.ts` (판정 엔진) | 쉬움 | 순수 함수 + JSON 룰테이블이라 거의 그대로 `.gs`로 옮기면 됨 |
| `receiptOcr.ts` (OpenRouter 호출) | 쉬움~보통 | `fetch` → `UrlFetchApp.fetch`로 교체, 재시도 로직 유지 가능 |
| `rules/domestic_travel_rules.json` | 쉬움 | JSON 그대로 사용 가능 |
| 데이터 모델(Prisma schema) | 어려움 | Sheets 행 기반으로 재설계, 트랜잭션·cascade 직접 구현 |
| `pdfToImage.ts` (mupdf 다중페이지) | **불가능** | WASM 미지원 — 기능 자체를 빼거나 외부 서비스 필요 |
| `generatePdf.ts` (pdf-lib+폰트) | 어려움(재설계) | Google Docs 템플릿 방식으로 완전히 다시 짜야 함 |
| `sendEmail.ts` (nodemailer) | 쉬움(오히려 단순해짐) | `GmailApp.sendEmail()` 한 줄 |
| UI(Next.js/React 컴포넌트 전체) | 어려움 | 프레임워크가 다르므로 상당 부분 재작성 |
| 이미지 업로드/보관 | 보통 | `public/uploads` → Drive 폴더, 코드는 다시 짜야 함 |

---

## 5. 현실적인 대안도 함께 검토해볼 것

"여러 직원이 안전하게 쓰게 하고 싶다"와 "회사 이메일로 보내고 싶다"가 진짜 목적이라면, 그
목적만 놓고 보면 GAS 말고도 방법이 있다:

- **지금 코드 그대로 + 사내 서버/클라우드에 배포**(예: 사내 리눅스 서버, 또는 Cloud
  Run/Vercel 같은 곳에 Next.js를 그대로 올리고 회사 SMTP만 연결) — 이러면 mupdf 다중페이지
  인식, pdf-lib PDF 생성 등 지금 이미 완성된 기능을 하나도 버리지 않아도 된다. 다만 로그인/권한
  체계는 직접 구현해야 한다(예: 사내 SSO 연동, 또는 간단한 이메일 기반 접근 제한).
- **하이브리드**: 지금 앱은 그대로 두고, "회사 이메일 발송"만 GAS 웹앱(작은 API 하나)으로
  분리해서 그쪽에 SMTP 대신 GmailApp을 시키는 것도 가능하다(전체 재작성 없이 이메일 문제만
  해결).

GAS로 완전히 옮기는 것의 장점은 "서버 유지·보안 관리를 구글에 완전히 맡길 수 있다"는 것이고,
비용은 "다중 페이지 PDF 인식 등 이미 만든 기능 일부를 포기하고 데이터 모델과 UI를 상당 부분
다시 짜야 한다"는 것이다. **어느 쪽이 나은지는 "이 앱을 얼마나 더 키울 계획인지"와 "사내에
서버를 둘 수 있는지"에 달려있다** — 이 부분은 결정 전에 논의가 필요하다.

---

## 6. 진행한다면 제안하는 순서

1. KIOST가 Google Workspace(회사 도메인 구글 계정) 환경인지 확인 — 아니면 이메일/권한
   이점이 상당 부분 사라짐
2. 데이터 모델을 Sheets 스키마로 먼저 설계(Trip/TripStop/Receipt 시트 + 컬럼 정의)
3. 판정 엔진(`verifyReceipt.ts`)과 룰테이블부터 `.gs`로 포팅 + 단위 테스트(지금 24개 테스트를
   GAS에서 실행 가능한 형태로든, 로컬 Node에서 로직만 검증하는 형태로든 유지)
4. OCR 호출부(`receiptOcr.ts`) 포팅, 다중 페이지 PDF는 "1페이지만 지원"으로 축소하고 이후
   외부 변환 서비스 연동 여부는 별도 결정
5. PDF 출력은 Google Docs 템플릿 방식으로 새로 설계
6. 프론트엔드는 지금 UI를 참고해 최소 기능부터 재구현(전체 재작성이므로 단계별 축소 스코프로)

이 순서대로 진행할지, 아니면 5장의 대안(지금 스택 유지 + 클라우드 배포)을 먼저 비교해볼지
결정한 뒤 다음 단계로 넘어가는 게 좋겠다.
