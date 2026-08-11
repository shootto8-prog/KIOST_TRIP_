import type { Dictionary } from "./ko";

/**
 * `: Dictionary` 어노테이션이 핵심이다 - ko.ts에 키를 추가/삭제/변경했는데 여기서 안 맞추면
 * 초과/누락 프로퍼티 체크로 tsc가 즉시 잡아낸다. 절대 `as const`나 타입 추론에 맡기지 말 것.
 */
const en: Dictionary = {
  common: {
    loading: "Loading...",
    processing: "Processing...",
  },
  themeToggle: {
    label: "Toggle dark mode",
  },
  languageToggle: {
    toEn: "Switch language (English)",
    toKo: "언어 전환 (한국어)",
  },
  layout: {
    footerTitle: "Trip Expense Assistant 1.0 (KIOST Domestic Travel Service) 2026",
    contactLabel: "Contact: KIOST General Affairs & Welfare Office",
    phoneAria: "Phone inquiry 051-664-9090",
    emailAria: "Email inquiry young@kiost.ac.kr",
    disclaimer:
      "This system is for reference only. The responsible department may revise or reject submissions upon review.",
  },
  home: {
    titlePrefix: "Trip Expense Assistant ",
    subtitle: "Register your trip and manage breakfast, transport, lodging, and field photos.",
    activeTripsHeading: "Active Trips",
    completedTripsHeading: "Completed Trips",
    statusActive: "In Progress",
  },
  categories: {
    breakfast: "Breakfast",
    transport: "Transport",
    lodging: "Lodging",
    field: "Field Photos",
  },
  localDataBoundary: {
    loading: "Loading...",
    notFound: "Trip not found.",
    home: "Home",
  },
  newTripSection: {
    addTrip: "New Trip",
  },
  categoryCard: {
    noReceipts: "No receipts yet",
  },
  categoryPageHeader: {
    backAria: "Back to trip",
  },
  tripHub: {
    backToList: "Trip List",
    statusCompleted: "Completed",
    autoSettlementOffTitle: "Auto-settlement off",
    autoSettlementOffBody: "The submitted documents will be reviewed manually to confirm the settlement amount.",
    pdfLabelAuto: "Download Settlement PDF",
    pdfLabelManual: "Download Submission PDF",
  },
  tripRoute: {
    title: "Trip Route",
    editButton: "Edit Trip Info",
    stopoverBadge: "+Stopover",
  },
  tripStatus: {
    complete: "End Trip",
    reopen: "Reopen as Active",
  },
  tripForm: {
    titleEdit: "Edit Trip Info",
    titleNew: "Trip Info",
    editHint: "Update here if the trip was extended, shortened, or a stopover changed.",
    period: "Trip Period",
    simpleMode: "Simple",
    detailedMode: "Detailed",
    modeToggleAria: "Toggle Simple / Detailed mode",
    simpleModeDesc: "Collect breakfast, transport, lodging receipts, and field photos in one place and email them after the trip ends",
    detailedModeDesc:
      "Get optional AI auto-settlement and the same settlement amount as the intranet, so you can copy the report sent after the trip ends directly into your reimbursement filing",
    autoSettlementTitle: "Auto-Settlement (AI Review)",
    autoSettlementAria: "Use auto-settlement",
    autoSettlementOnDesc: "An external LLM decides approved/rejected. Be mindful that sensitive information isn't exposed",
    autoSettlementOffDesc: "Submit documents only, without AI review.",
    positionGradeTitle: "Position Grade",
    lockedHint: "Neither can be changed after the trip is registered.",
    locationPlaceholder: "Location",
    addStopoverAria: "Add stopover",
    removeStopoverAria: "Remove stopover",
    errorDateRequired: "Please enter the trip start and end dates as real calendar dates, including the 4-digit year.",
    errorEndBeforeStart: "The end date cannot be earlier than the start date.",
    errorLocationRequired: "Please enter a location for every route item.",
    errorGradeRequired: "Please select either Senior or Junior grade.",
    errorSaveFailed: "Failed to save.",
    cancel: "Cancel",
    saving: "Saving...",
    saveChanges: "Save Changes",
    startTrip: "Start Trip",
    stopLabel: { DEPARTURE: "Departure", STOPOVER: "Stopover", ARRIVAL: "Destination" },
  },
  positionGrade: {
    SENIOR: "Senior",
    JUNIOR: "Junior or below",
  },
  transportRoutePicker: {
    removeSegmentAria: "Remove segment",
    roundTrip: "Round trip",
    rentOrShared: "Rental/shared vehicle",
    carpool: "Carpool",
    rentCarpoolNote: "The flat fare doesn't apply to rentals or carpools.",
    fromPlaceholder: "From (e.g. Busan)",
    toPlaceholder: "To (e.g. Gyeongju)",
    notFound: "This route isn't in the fare table. Please contact the responsible office.",
    cancel: "Cancel",
    addSegment: "Add Segment",
  },
  mealDeduction: {
    title: "Meal Deduction",
    decreaseAria: "Decrease meal deduction by 1",
    increaseAria: "Increase meal deduction by 1",
    unit: "meal",
  },
};

export default en;
