import type { Dictionary } from "./ko";

/**
 * `: Dictionary` 어노테이션이 핵심이다 - ko.ts에 키를 추가/삭제/변경했는데 여기서 안 맞추면
 * 초과/누락 프로퍼티 체크로 tsc가 즉시 잡아낸다. 절대 `as const`나 타입 추론에 맡기지 말 것.
 */
const en: Dictionary = {
  common: {
    loading: "Loading...",
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
};

export default en;
