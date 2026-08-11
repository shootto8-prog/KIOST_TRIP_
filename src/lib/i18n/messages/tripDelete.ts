import type { Locale } from "../locale";

export type DeleteKind = "cancel" | "delete";

/** "취소"/"삭제" - 버튼 라벨. */
export function tripDeleteLabel(locale: Locale, kind: DeleteKind): string {
  if (locale === "ko") return kind === "cancel" ? "취소" : "삭제";
  return kind === "cancel" ? "Cancel" : "Delete";
}

/**
 * "이 출장을 취소하시겠어요?" 같은 확인창 문구 - 영어는 "Cancel this trip?"처럼 동사가
 * 문장 맨 앞으로 오는 어순이라 label을 문장 중간에 끼워 넣는 치환으로는 안 나온다.
 */
export function buildDeleteConfirmMessage(locale: Locale, kind: DeleteKind): string {
  if (locale === "ko") {
    const verb = kind === "cancel" ? "취소" : "삭제";
    return `이 출장을 ${verb}하시겠어요? 등록된 영수증도 함께 삭제되며 되돌릴 수 없습니다.`;
  }
  const verb = kind === "cancel" ? "Cancel" : "Delete";
  return `${verb} this trip? All registered receipts will also be deleted and this cannot be undone.`;
}

export function buildDeleteAriaLabel(locale: Locale, kind: DeleteKind): string {
  if (locale === "ko") return `출장 ${kind === "cancel" ? "취소" : "삭제"}`;
  return kind === "cancel" ? "Cancel trip" : "Delete trip";
}
