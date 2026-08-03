export type ReceiptHints = {
  amountGuess: number | null;
  dateGuess: string | null; // ISO 8601, 로컬 시각 기준(타임존 없음)
  merchantGuess: string | null;
};

const AMOUNT_KEYWORDS = ["합계", "총액", "결제금액", "받을금액", "청구금액", "total"];

/**
 * OCR 원문에서 금액/일시/상호명 "후보"를 뽑아내는 가벼운 휴리스틱.
 * 최종 실비정산 판정 로직(Phase 4)의 입력값이 아니라, 사람이 눈으로 확인하기 쉽도록
 * 화면에 보여주기 위한 보조 정보다.
 */
export function extractReceiptHints(rawText: string): ReceiptHints {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let amountGuess: number | null = null;
  for (const line of lines) {
    if (AMOUNT_KEYWORDS.some((kw) => line.toLowerCase().includes(kw.toLowerCase()))) {
      const nums = extractNumbers(line);
      if (nums.length) {
        amountGuess = Math.max(...nums);
        break;
      }
    }
  }
  if (amountGuess === null) {
    const allNums = extractNumbers(rawText);
    if (allNums.length) amountGuess = Math.max(...allNums);
  }

  let dateGuess: string | null = null;
  const dateMatch = rawText.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (dateMatch) {
    const [, y, m, d] = dateMatch;
    const timeMatch = rawText.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    const hh = (timeMatch?.[1] ?? "00").padStart(2, "0");
    const mm = timeMatch?.[2] ?? "00";
    const ss = timeMatch?.[3] ?? "00";
    dateGuess = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T${hh}:${mm}:${ss}`;
  }

  // "--- 페이지 N ---" 같은 다중 페이지 구분선은 상호명 후보에서 제외한다 (receiptOcr.ts가 여러
  // 페이지 원문을 이어붙일 때 넣는 구분자 - 실제 상호명이 아님).
  const merchantGuess =
    lines.find(
      (l) =>
        /[가-힣a-zA-Z]{2,}/.test(l) &&
        !AMOUNT_KEYWORDS.some((kw) => l.toLowerCase().includes(kw.toLowerCase())) &&
        !/^-+.*-+$/.test(l) &&
        !/페이지\s*\d+/.test(l)
    ) ?? null;

  return { amountGuess, dateGuess, merchantGuess };
}

function extractNumbers(text: string): number[] {
  const matches = text.match(/[\d,]{3,}(?=\s*원|\s*₩|(?![\d,]))/g) ?? [];
  return matches
    .map((m) => parseInt(m.replace(/,/g, ""), 10))
    .filter((n) => Number.isFinite(n) && n >= 100 && n <= 5_000_000);
}
