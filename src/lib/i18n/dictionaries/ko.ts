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
  tripForm: {
    titleEdit: "출장 정보 변경",
    titleNew: "출장정보",
    editHint: "출장이 연장·단축되거나 경유지가 바뀐 경우 여기서 수정하세요.",
    period: "출장기간",
    simpleMode: "간편모드",
    detailedMode: "상세모드",
    modeToggleAria: "간편모드 / 상세모드 전환",
    simpleModeDesc: "조식, 교통, 숙박영수증, 현장사진을 한 곳에 모아 출장종료 후 이메일로 발송합니다",
    detailedModeDesc:
      "AI 자동정산(선택사항)과 인트라넷과 동일한 정산금액을 산출하여 출장종료 후 발송되는 레포트 내역을 그대로 복사하여 복명할 수 있습니다",
    autoSettlementTitle: "자동정산 (AI 판정)",
    autoSettlementAria: "자동정산 사용 여부",
    autoSettlementOnDesc: "외부 LLM을 이용하여 AI가 인정/불인정을 판정합니다. 민감정보가 노출되지 않도록 유의해주세요",
    autoSettlementOffDesc: "AI 판정 없이 증빙서류만 제출합니다.",
    positionGradeTitle: "직급",
    lockedHint: "출장 등록 후에는 둘 다 바꿀 수 없어요.",
    locationPlaceholder: "장소",
    addStopoverAria: "경유지 추가",
    removeStopoverAria: "경유지 삭제",
    errorDateRequired: "출장 시작일과 종료일을 연도(4자리)까지 포함해, 실제로 있는 날짜로 입력해 주세요.",
    errorEndBeforeStart: "종료일이 시작일보다 빠를 수 없습니다.",
    errorLocationRequired: "모든 경로 항목에 장소를 입력해 주세요.",
    errorGradeRequired: "책임급 / 선임급 이하 중 하나를 선택해 주세요.",
    errorSaveFailed: "저장에 실패했습니다.",
    cancel: "취소",
    saving: "저장 중...",
    saveChanges: "변경 사항 저장",
    startTrip: "출장 시작",
    stopLabel: { DEPARTURE: "출발지", STOPOVER: "경유지", ARRIVAL: "목적지" },
  },
  positionGrade: {
    SENIOR: "책임급",
    JUNIOR: "선임급 이하",
  },
  transportRoutePicker: {
    removeSegmentAria: "구간 삭제",
    roundTrip: "왕복",
    rentOrShared: "렌트/공용차량",
    carpool: "동승",
    rentCarpoolNote: "렌트/동승은 정액 요금이 적용되지 않습니다.",
    fromPlaceholder: "출발 (예: 부산)",
    toPlaceholder: "도착 (예: 경주)",
    notFound: "입력되지 않은 구간입니다. 담당자에게 문의해주세요.",
    cancel: "취소",
    addSegment: "구간 추가",
  },
  mealDeduction: {
    title: "식비공제",
    decreaseAria: "식비공제 1식 줄이기",
    increaseAria: "식비공제 1식 늘리기",
    unit: "식",
  },
};

export default ko;
export type Dictionary = typeof ko;
