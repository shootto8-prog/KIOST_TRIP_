import { getKstParts } from "./kst";

/**
 * 현장사진(FIELD)을 카메라로 직접 촬영했을 때만 촬영 시각을 사진에 새겨 넣는다 - 옛날 필름
 * 카메라의 노란색 날짜 스탬프와 같은 용도(증빙 시점을 사진 자체에서 확인 가능하게).
 * 갤러리에서 고른 기존 사진에는 찍지 않는다(실제 촬영 시각을 알 수 없어 오히려 오해를 줄 수 있음).
 * 항상 한국 시각(KST) 기준으로 표시한다 - 여행자가 해외에 있어도 국내 정산 관례를 따른다.
 */
function formatStamp(date: Date): string {
  const { year, month, day, hour, minute } = getKstParts(date);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}.${pad(month + 1)}.${pad(day)}. ${pad(hour)}:${pad(minute)}`;
}

/** 스탬프 이미지(KIOST 소인, public/kiost-stamp.png)를 불러온다 - 못 불러와도(오프라인 등)
 * 날짜/시간 텍스트 스탬프까지 막히면 안 되므로 실패 시 null만 반환한다. */
async function loadStampMark(): Promise<ImageBitmap | null> {
  try {
    const res = await fetch("/kiost-stamp.png");
    if (!res.ok) return null;
    return await createImageBitmap(await res.blob());
  } catch {
    return null;
  }
}

export type StampCoords = { lat: number; lng: number };

/** navigator.geolocation은 실패/거부/타임아웃이 흔해서(실내, 권한 거부 등) 절대 throw하지
 * 않고 null로 대체한다 - 위치를 못 구해도 날짜/시간 스탬프까지 막히면 안 된다. */
export function getCurrentCoords(timeoutMs = 8000): Promise<StampCoords | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 }
    );
  });
}

/**
 * 날짜/시간만 찍는다 - GPS 좌표 줄은 뺐다(2026-08-11, 사용자 요청). 위치 증빙은 별도의
 * "네이버지도 인증하기" 기능(naverMapClient.ts)이 전담하므로 사진 스탬프에서는 중복이다.
 */
export async function stampDateTime(input: Blob, date: Date): Promise<Blob> {
  const [bitmap, markBitmap] = await Promise.all([
    createImageBitmap(input, { imageOrientation: "from-image" }),
    loadStampMark(),
  ]);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("이 브라우저에서는 이미지를 처리할 수 없습니다.");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const text = formatStamp(date);
  const fontSize = Math.max(20, Math.round(canvas.width * 0.035));
  ctx.font = `700 ${fontSize}px "Courier New", monospace`;
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.lineWidth = fontSize * 0.18;
  ctx.strokeStyle = "rgba(0,0,0,0.7)";
  ctx.fillStyle = "#ff9800";

  const marginX = fontSize * 0.6;
  const x = canvas.width - marginX;
  const y = canvas.height - fontSize * 0.6;
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);

  // KIOST 소인 이미지를 날짜/시간 텍스트 바로 위, 같은 오른쪽 정렬선에 맞춰 그린다(2026-08-11).
  if (markBitmap) {
    const markW = canvas.width * 0.22;
    const markH = markBitmap.height * (markW / markBitmap.width);
    const markX = canvas.width - marginX - markW;
    const markY = y - fontSize - fontSize * 0.4 - markH;
    ctx.drawImage(markBitmap, markX, Math.max(0, markY), markW, markH);
    markBitmap.close();
  }

  return canvas.convertToBlob({ type: "image/jpeg", quality: 0.92 });
}
