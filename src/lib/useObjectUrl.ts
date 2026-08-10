"use client";

import { useEffect, useState } from "react";
import { getReceiptImageBytes } from "./localDb";

/**
 * 암호화된 영수증 이미지를 화면에 그리기 위한 훅 - localDb에서 복호화된 바이트를 읽어와
 * URL.createObjectURL()로 img src에 쓸 수 있는 URL을 만든다. imageId가 바뀌거나 컴포넌트가
 * 사라질 때 반드시 revokeObjectURL()로 정리한다 - 안 하면 그리드에 썸네일이 여러 개 뜰 때마다
 * 메모리에 계속 쌓인다.
 */
export function useReceiptImageUrl(imageId: string | undefined, variant: "full" | "thumb" = "thumb") {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!imageId) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;

    getReceiptImageBytes(imageId, variant).then((result) => {
      if (cancelled || !result) return;
      objectUrl = URL.createObjectURL(new Blob([result.bytes], { type: result.mimeType }));
      setUrl(objectUrl);
    });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [imageId, variant]);

  return url;
}
