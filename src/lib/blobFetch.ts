import { get } from "@vercel/blob";

export class PrivateBlobFetchError extends Error {
  constructor(
    message: string,
    public readonly timedOut: boolean
  ) {
    super(message);
  }
}

/**
 * 영수증 사진은 2026-08-07부터 Vercel Blob에 access: "private"로 저장된다 - URL을 안다고
 * 아무나 열람할 수 있던 구멍(카드번호·승인번호가 찍힌 사진이 인증 없이 영구 공개되던 문제)을
 * 막기 위함이다. private Blob은 더 이상 평범한 fetch(url)로 못 읽고, 이 함수(get() 기반)를
 * 거쳐야 한다 - OCR 입력 준비, 재분석, 정산서 PDF 조립 등 서버가 원본 바이트를 다시 읽는 모든
 * 지점에서 공용으로 쓴다.
 */
export async function fetchPrivateBlob(url: string, timeoutMs: number): Promise<Buffer> {
  try {
    const result = await get(url, { access: "private", abortSignal: AbortSignal.timeout(timeoutMs) });
    if (!result || !result.stream) {
      throw new PrivateBlobFetchError("Blob을 찾을 수 없습니다.", false);
    }
    return Buffer.from(await new Response(result.stream).arrayBuffer());
  } catch (err) {
    if (err instanceof PrivateBlobFetchError) throw err;
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    throw new PrivateBlobFetchError(
      timedOut ? "시간이 너무 오래 걸렸습니다." : "Blob을 불러오지 못했습니다.",
      timedOut
    );
  }
}
