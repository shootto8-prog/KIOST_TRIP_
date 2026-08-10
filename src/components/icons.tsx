/**
 * 4개 카테고리 아이콘은 애플/iOS 앱 아이콘 스타일이다 - 카테고리별 고정 단색 스퀴클
 * (rounded-square) 배경 + 단순한 흰색 글리프 한 개. 배경색을 아이콘이 직접 갖고 있으므로
 * 이 아이콘을 감싸는 쪽(CategoryCard 등)은 별도 원형 배경/링을 씌우지 않는다. (2026-08-07)
 */
export function IconBreakfast({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className}>
      <rect x="1" y="1" width="30" height="30" rx="9" fill="#FF9F0A" />
      <path d="M9 13.5h10.5v6.3c0 2.9-2.3 5.2-5.2 5.2h-.1c-2.9 0-5.2-2.3-5.2-5.2v-6.3Z" fill="#fff" />
      <path d="M19.5 15.3h1a2.6 2.6 0 0 1 0 5.2h-1" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M12.5 11c0-.9.7-1.3.7-2.2S12.5 6.9 12.5 6.9M16 11c0-.9.7-1.3.7-2.2S16 6.9 16 6.9"
        stroke="#fff"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconTransport({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className}>
      <rect x="1" y="1" width="30" height="30" rx="9" fill="#0A84FF" />
      <path
        d="M7 16.3 24.4 8.2c.9-.4 1.8.5 1.4 1.4l-6.9 16.6c-.4 1-1.8 1-2.2 0l-2.6-6.3-6.3-2.4c-1-.4-1-1.8.2-2.2Z"
        fill="#fff"
      />
      <path d="m13.7 17.9 4.2-4.2" stroke="#0A84FF" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function IconLodging({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className}>
      <rect x="1" y="1" width="30" height="30" rx="9" fill="#AF52DE" />
      <path
        d="M6.5 23v-9.3a1.2 1.2 0 0 1 1.2-1.2h4.6a1.2 1.2 0 0 1 1.2 1.2v3.8"
        fill="none"
        stroke="#fff"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9.9" cy="14.9" r="1.5" fill="#fff" />
      <path
        d="M6.5 17.5h18.2a1.8 1.8 0 0 1 1.8 1.8V23"
        fill="none"
        stroke="#fff"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M6 25.5h20" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function IconCamera({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} strokeWidth={1.75} stroke="currentColor">
      <path
        d="M4 8h2.5l1-2h9l1 2H20a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13.5" r="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconPhoto({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} strokeWidth={1.75} stroke="currentColor">
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="m5 16 4.2-4.6a1.5 1.5 0 0 1 2.2.05L14 15l1.4-1.6a1.5 1.5 0 0 1 2.2 0L19.5 15.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="8.3" cy="8.3" r="1.4" />
    </svg>
  );
}

/** 4개 카테고리 배지 중 "현장사진" 전용 아이콘 - 갤러리에서 사진 고를 때 쓰는 범용 IconPhoto와는
 * 다른 컴포넌트다(같은 함수를 공유하면 카테고리 배지를 바꿀 때 사진 선택 버튼 아이콘까지 같이
 * 바뀌어 버린다 - 실사용 중 발견). 나머지 3개와 같은 애플/iOS 스타일(스퀴클+흰 글리프)이다.
 * (2026-08-07) */
export function IconFieldPhoto({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className}>
      <rect x="1" y="1" width="30" height="30" rx="9" fill="#FF375F" />
      <path d="M9 12.5 10.3 10a1.2 1.2 0 0 1 1.1-.7h9.2c.5 0 .9.3 1.1.7l1.3 2.5H9Z" fill="#fff" />
      <rect x="6.5" y="12.5" width="19" height="12.5" rx="2" fill="#fff" />
      <circle cx="16" cy="19" r="4.4" fill="#FF375F" />
      <circle cx="16" cy="19" r="2.6" fill="#fff" />
    </svg>
  );
}

export function IconPlus({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} strokeWidth={2} stroke="currentColor">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

export function IconMinus({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} strokeWidth={2} stroke="currentColor">
      <path d="M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

export function IconTrash({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} strokeWidth={1.75} stroke="currentColor">
      <path
        d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconCalendar({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} strokeWidth={1.75} stroke="currentColor">
      <rect x="3.5" y="5" width="17" height="16" rx="2" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconPdf({ className = "size-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} strokeWidth={1.75} stroke="currentColor">
      <path
        d="M6 2.5h8.5L19 7v13.5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M14 2.5V7h5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 13h1.2a1.3 1.3 0 1 1 0 2.6H8V13Zm0 0v4.5M12.2 17.5V13h1a1.8 1.8 0 0 1 0 4.5h-1ZM16.5 13h-1.8v4.5M14.7 15.3h1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconPhone({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} strokeWidth={1.9} stroke="currentColor">
      <path
        d="M6.6 3.5h2.3l1.3 4-2 1.3a11.6 11.6 0 0 0 5 5l1.3-2 4 1.3v2.3a1.6 1.6 0 0 1-1.7 1.6A16.3 16.3 0 0 1 5 5.2a1.6 1.6 0 0 1 1.6-1.7Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconMail({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} strokeWidth={1.9} stroke="currentColor">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconDownload({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} strokeWidth={1.9} stroke="currentColor">
      <path
        d="M12 4v11m0 0 4-4m-4 4-4-4M5 19h14"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconChevronLeft({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} strokeWidth={2.1} stroke="currentColor">
      <path d="M15 5 8 12l7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconSun({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} strokeWidth={1.8} stroke="currentColor">
      <circle cx="12" cy="12" r="4.2" />
      <path
        d="M12 2.5v2.2M12 19.3v2.2M4.5 12H2.3M21.7 12h-2.2M6.1 6.1 4.5 4.5M19.5 19.5l-1.6-1.6M17.9 6.1l1.6-1.6M4.5 19.5l1.6-1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconMoon({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} strokeWidth={1.8} stroke="currentColor">
      <path
        d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a6.8 6.8 0 0 0 11 11Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconPerson({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} strokeWidth={1.8} stroke="currentColor">
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 20a7 7 0 0 1 14 0" strokeLinecap="round" />
    </svg>
  );
}
