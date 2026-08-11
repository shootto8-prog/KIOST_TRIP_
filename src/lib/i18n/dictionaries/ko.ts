/**
 * 번역 원본(한국어) 사전. en.ts가 이 파일의 타입(`Dictionary`)에 맞춰 작성되므로, 여기에
 * 네임스페이스/키를 추가하면 en.ts에서 누락 시 tsc가 즉시 컴파일 에러로 잡아준다.
 * 새 화면을 번역할 때는 이 파일에 네임스페이스를 추가하고 en.ts에 대응 항목을 같은 커밋에서
 * 채워 넣는다 - 절대 두 파일을 다른 커밋으로 나누지 않는다(타입 안전망이 일시적으로 깨짐).
 */
const ko = {
  common: {
    loading: "불러오는 중...",
    processing: "처리 중...",
  },
  themeToggle: {
    label: "다크모드 전환",
  },
  languageToggle: {
    toEn: "언어 전환 (English)",
    toKo: "Switch language (한국어)",
  },
  layout: {
    footerTitle: "정총무 1.0 (KIOST 국내여비 간편서비스) 2026",
    contactLabel: "문의 : KIOST 총무복지실",
    phoneAria: "전화 문의 051-664-9090",
    emailAria: "이메일 문의 young@kiost.ac.kr",
    disclaimer: "해당 시스템은 참고용이며, 담당부서 검토시 수정,반려될 수 있습니다",
  },
  home: {
    titlePrefix: "정총무",
    subtitle: "출장정보를 등록하고 조식·교통·숙박·현장사진을 관리하세요.",
    activeTripsHeading: "진행중인 출장",
    completedTripsHeading: "종료된 출장",
    statusActive: "진행중",
  },
  categories: {
    breakfast: "조식",
    transport: "교통",
    lodging: "숙박",
    field: "현장사진",
  },
  localDataBoundary: {
    loading: "불러오는 중...",
    notFound: "출장을 찾을 수 없습니다.",
    home: "홈으로",
  },
  newTripSection: {
    addTrip: "새 출장 등록",
  },
  categoryCard: {
    noReceipts: "등록된 영수증 없음",
  },
  categoryPageHeader: {
    backAria: "출장으로 돌아가기",
  },
  tripHub: {
    backToList: "출장 목록",
    statusCompleted: "종료됨",
    autoSettlementOffTitle: "자동정산 미사용",
    autoSettlementOffBody: "제출된 증빙 서류는 담당자가 직접 확인해 정산 금액을 확정합니다.",
    pdfLabelAuto: "정산 결과 PDF 다운로드",
    pdfLabelManual: "제출 서류 PDF 다운로드",
  },
  tripRoute: {
    title: "출장경로",
    editButton: "출장 정보 변경",
    stopoverBadge: "+경유",
  },
  tripStatus: {
    complete: "출장 종료",
    reopen: "다시 진행중으로 되돌리기",
  },
};

export default ko;
export type Dictionary = typeof ko;
