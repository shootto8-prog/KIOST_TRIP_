/**
 * OCR 원문에 남아있는 카드번호·승인번호를 추가로 마스킹한다. 가맹점 단말기가 인쇄 시점에 이미
 * 중간자리를 *로 가려주는 경우가 많지만(예: "9409-15**-****-0980") 전부 그런 건 아니고,
 * 승인번호는 대부분 마스킹 없이 그대로 인쇄된다. 이 텍스트가 DB에 평문으로 저장되고 화면의
 * "원문 텍스트 전체 보기"에 그대로 노출되므로, 저장 전에 한 번 더 정규식으로 가린다.
 *
 * 사진(이미지) 자체는 픽셀 단위로 가리지 않는다 - 지금 쓰는 무료 OCR 모델은 텍스트의 화면상
 * 위치(좌표)를 신뢰성 있게 주지 않아서, 이미지 마스킹을 시도하면 카드번호를 놓치거나 엉뚱한
 * 부분(상호명·금액)을 가릴 위험이 크다. 대신 사진 파일 자체를 비공개(access: "private")로
 * 바꾸고 소유자 인증을 거친 프록시(/api/receipts/image/[id])로만 열람하게 했다 - 원본 유출
 * 경로를 막는 게 이 텍스트 마스킹보다 더 근본적인 방어선이다.
 */

/** 대시/공백으로 구분된 2~4자리 숫자·별표 그룹이 3~4묶음 이어지는 패턴 (카드번호 전형적 형태). */
const CARD_NUMBER_RE = /(?:[\d*]{2,4}[-\s]){2,3}[\d*]{2,4}/g;

/**
 * 매치된 문자열이 실제 카드번호일 가능성을 길이로 거른다 - 전화번호(10자리 이하)나 날짜,
 * 사업자등록번호(10자리, NNN-NN-NNNNN)는 이 범위보다 짧아 건드리지 않는다.
 */
function maskCardNumberMatch(match: string): string | null {
  const digitOrStarChars = match.match(/[\d*]/g) ?? [];
  if (digitOrStarChars.length < 12 || digitOrStarChars.length > 19) return null;
  if (!/\d/.test(match)) return null; // 전부 *면 이미 완전히 마스킹된 상태 - 손댈 필요 없음

  const KEEP_LAST = 4; // 마지막 4자리(숫자/별표)만 남기고 그 앞의 숫자는 전부 *로 바꾼다
  let remainingToKeep = KEEP_LAST;
  const chars = match.split("");
  for (let i = chars.length - 1; i >= 0; i--) {
    if (!/[\d*]/.test(chars[i])) continue; // 구분자(-, 공백)는 그대로 둔다
    if (remainingToKeep > 0) {
      remainingToKeep--;
      continue;
    }
    chars[i] = "*";
  }
  return chars.join("");
}

/** "승인번호 9436 3836 (IC)" / "승인번호 66810327" 처럼 라벨 뒤에 이어지는 숫자를 마스킹한다. */
const APPROVAL_NUMBER_RE = /(승인\s*번호\s*[:：]?\s*)([\d\s]{4,20})/g;

export function maskSensitiveReceiptText(text: string): string {
  let masked = text.replace(CARD_NUMBER_RE, (m) => maskCardNumberMatch(m) ?? m);
  masked = masked.replace(APPROVAL_NUMBER_RE, (_full, label: string, digits: string) => {
    return `${label}${digits.replace(/\d/g, "*")}`;
  });
  return masked;
}
