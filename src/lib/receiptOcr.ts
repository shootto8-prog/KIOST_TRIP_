const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export class ReceiptOcrError extends Error {}

function extFromMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/heic" || mime === "image/heif") return "heic";
  return "jpeg";
}

function buildPrompt(pageCount: number): string {
  const isMulti = pageCount > 1;
  const intro = isMulti
    ? `다음은 영수증/증빙서류의 ${pageCount}페이지 사진입니다 (페이지 순서대로 제공됩니다).`
    : `다음은 영수증 사진입니다.`;
  const transcribeInstruction = isMulti
    ? `각 페이지에 보이는 모든 텍스트를 "--- 페이지 N ---" 구분자와 함께 페이지 순서대로 옮겨 적으세요.`
    : `이미지에 보이는 모든 텍스트를 위에서 아래 순서로 옮겨 적으세요.`;
  const summaryIntro = isMulti
    ? `여러 페이지 전체를 하나의 문서로 보고, 고객이 실제로 최종 지불한 합계 금액, 상호명, 결제 일시를 아래 JSON 형식으로만 적으세요.`
    : `위 영수증에서 고객이 실제로 최종 지불한 합계 금액, 상호명, 결제 일시를 아래 JSON 형식으로만 적으세요.`;
  const multiNote = isMulti
    ? ` 정보가 여러 페이지에 나뉘어 있다면(예: 1페이지 요약 + 2페이지 결제내역) 모든 페이지를 종합해
하나의 최종 금액만 답하세요.`
    : "";

  return `${intro} 아래 두 섹션 형식에 정확히 맞춰 답변하세요.

[원문]
${transcribeInstruction} 최대한 정확하게 그대로 옮기고 설명이나 해석은 추가하지 마세요. 텍스트를 전혀
읽을 수 없으면 "(텍스트 인식 불가)"라고만 적으세요.

[요약]
${summaryIntro} (다른 설명 문장 없이 JSON 한 줄만).
{"merchant": "상호명 또는 null", "amount": 숫자만(원 단위, 콤마·문자 없이) 또는 null, "datetime": "YYYY-MM-DD HH:MM:SS 형식 또는 null"}

주의: 사업자등록번호, 카드 승인번호, 전화번호, 포인트/적립금액, 할인 전 정가, 매장 고유번호 등은
결제 금액이 아닙니다. 절대 amount 필드에 넣지 말고, 반드시 실제로 승인·결제된 최종 합계 금액만
넣으세요.${multiNote} 아무 금액도 확인할 수 없으면 amount는 null로 두세요.`;
}

// 무료 티어 1차 모델이 업스트림에서 일시적으로 혼잡(429)할 때를 대비한 형제 모델.
// 둘 다 OpenRouter의 무료 멀티모달(이미지 입력 지원) Gemma 4 계열이다.
const FALLBACK_MODEL = "google/gemma-4-26b-a4b-it:free";

export type StructuredExtract = {
  merchant: string | null;
  amount: number | null;
  datetime: string | null;
};

export type ReceiptOcrResult = {
  text: string | null;
  structured: StructuredExtract | null;
  model: string | null;
};

export type ReceiptImage = {
  buffer: Buffer;
  mimeType: string;
};

function extractJsonBlock(text: string): string | null {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i) ?? text.match(/```\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const braceMatch = text.match(/\{[\s\S]*\}/);
  return braceMatch ? braceMatch[0] : null;
}

function parseStructuredExtract(section: string): StructuredExtract | null {
  const jsonStr = extractJsonBlock(section);
  if (!jsonStr) return null;
  try {
    const obj = JSON.parse(jsonStr);
    let amount: number | null = null;
    if (typeof obj.amount === "number" && Number.isFinite(obj.amount)) {
      amount = obj.amount;
    } else if (typeof obj.amount === "string") {
      const parsed = parseInt(obj.amount.replace(/[^\d]/g, ""), 10);
      amount = Number.isFinite(parsed) ? parsed : null;
    }
    return {
      merchant: typeof obj.merchant === "string" && obj.merchant.trim() ? obj.merchant.trim() : null,
      amount,
      datetime: typeof obj.datetime === "string" && obj.datetime.trim() ? obj.datetime.trim() : null,
    };
  } catch {
    return null;
  }
}

/** 모델 응답을 [원문]/[요약] 두 섹션으로 나눈다. 모델이 형식을 완전히 안 지켜도 최대한 관대하게 처리한다. */
function splitSections(content: string): { rawText: string | null; structured: StructuredExtract | null } {
  const summaryIdx = content.indexOf("[요약]");
  const rawSection = summaryIdx >= 0 ? content.slice(0, summaryIdx) : content;
  const rawText = rawSection.replace(/^\s*\[원문\]\s*/, "").trim();
  const structured = parseStructuredExtract(summaryIdx >= 0 ? content.slice(summaryIdx) : content);
  const cleanedRawText = rawText.includes("텍스트 인식 불가") || !rawText ? null : rawText;
  return { rawText: cleanedRawText, structured };
}

async function callModel(model: string, dataUrls: string[]): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new ReceiptOcrError("OPENROUTER_API_KEY가 설정되지 않았습니다.");
  }

  const res = await fetch(OPENROUTER_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: buildPrompt(dataUrls.length) },
            ...dataUrls.map((url) => ({ type: "image_url", image_url: { url } })),
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new ReceiptOcrError(`OpenRouter API(${model}) HTTP ${res.status}: ${bodyText.slice(0, 300)}`);
  }

  const data = await res.json();
  if (data.error) {
    throw new ReceiptOcrError(`OpenRouter API(${model}) error: ${JSON.stringify(data.error).slice(0, 300)}`);
  }

  const content: string | undefined = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new ReceiptOcrError(`OpenRouter API(${model})가 빈 응답을 반환했습니다.`);
  }
  return content;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const RETRY_DELAY_MS = 2500;

/**
 * 무료 티어 모델이 업스트림 혼잡(429)이나 일시적 오류(5xx 등)로 실패하는 경우가 잦아,
 * 같은 모델로 짧은 대기 후 한 번 더 시도한다. 순간적인 혼잡은 몇 초 뒤 풀리는 경우가 많다.
 */
async function callModelWithRetry(model: string, dataUrls: string[], retries = 1): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await callModel(model, dataUrls);
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        console.error(`Receipt OCR model(${model}) attempt ${attempt + 1} failed, retrying in ${RETRY_DELAY_MS}ms:`, err);
        await sleep(RETRY_DELAY_MS);
      }
    }
  }
  throw lastErr;
}

/**
 * Google Vision(유료, 결제 필요) 대신 이미 설정된 멀티모달 LLM(OpenRouter의
 * google/gemma-4-31b-it:free)에 영수증 이미지를 직접 보내 텍스트 전문과 함께 상호명/금액/일시를
 * 구조화된 JSON으로 직접 추출한다. 예전에는 원문 텍스트만 받아 정규식으로 "가장 큰 숫자"를 금액으로
 * 추측했는데, 영수증에 사업자번호·카드승인번호처럼 실제 결제액보다 훨씬 큰 숫자가 많아 오인식이
 * 잦았다 - 문맥을 이해하는 LLM에게 "실제 결제 총액이 뭔지" 직접 물어보는 쪽이 훨씬 정확하다.
 *
 * 여러 장(images.length > 1)을 넘기면 한 번의 채팅 요청에 이미지를 전부 첨부해 모델이 문서 전체를
 * 한꺼번에 보고 답하게 한다 - PDF가 여러 페이지로 나뉜 경우(예: 1p 항공권 요약 + 2p 결제내역) 첫 장만
 * 보내면 뒷장의 정보(예: 실제 결제금액)를 놓치기 때문.
 *
 * 무료 티어라 1차/폴백 모델이 동시에 업스트림 혼잡(429)에 걸리는 경우가 있어(특히 여러 사람이 동시에
 * 테스트할 때), 모델별로 짧은 대기 후 1회씩 재시도한 다음에야 폴백/최종 실패로 넘어간다.
 * 최악의 경우 1차(2회) + 폴백(2회) 총 4번 시도 후에 "인식 불가"로 처리된다.
 */
export async function runReceiptOcr(images: ReceiptImage[]): Promise<ReceiptOcrResult> {
  if (images.length === 0) {
    throw new ReceiptOcrError("OCR에 전달할 이미지가 없습니다.");
  }
  const primaryModel = process.env.LLM_MODEL || "google/gemma-4-31b-it:free";
  const dataUrls = images.map(({ buffer, mimeType }) => {
    const ext = extFromMime(mimeType);
    return `data:image/${ext};base64,${buffer.toString("base64")}`;
  });

  let content: string;
  let usedModel: string;
  try {
    content = await callModelWithRetry(primaryModel, dataUrls);
    usedModel = primaryModel;
  } catch (primaryErr) {
    if (primaryModel === FALLBACK_MODEL) throw primaryErr;
    console.error(`Receipt OCR primary model(${primaryModel}) failed after retry, falling back:`, primaryErr);
    try {
      content = await callModelWithRetry(FALLBACK_MODEL, dataUrls);
      usedModel = FALLBACK_MODEL;
    } catch (fallbackErr) {
      throw new ReceiptOcrError(
        `1차 모델(${primaryModel})과 폴백 모델(${FALLBACK_MODEL}) 모두 재시도 후에도 실패: ${
          (fallbackErr as Error).message
        }`
      );
    }
  }

  const { rawText, structured } = splitSections(content);
  return { text: rawText, structured, model: rawText ? usedModel : null };
}
