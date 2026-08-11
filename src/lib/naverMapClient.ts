export type LocationSnapshot = { address: string | null; imageBlob: Blob };

/**
 * /api/naver-map/snapshot 서버 프록시를 호출한다 - 클라이언트가 네이버 API 키를 직접 쓰지
 * 않는 이유는 route.ts 주석 참고. base64로 받은 지도 이미지를 Blob으로 되돌려, 여느 현장사진
 * 첨부 이미지와 동일하게 다룰 수 있게 한다.
 */
export async function fetchLocationSnapshot(lat: number, lng: number): Promise<LocationSnapshot> {
  const res = await fetch("/api/naver-map/snapshot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat, lng }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.imageBase64) {
    throw new Error(data?.error ?? "지도 이미지를 가져오지 못했습니다.");
  }
  const binary = atob(data.imageBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { address: data.address ?? null, imageBlob: new Blob([bytes], { type: data.mimeType ?? "image/jpeg" }) };
}
