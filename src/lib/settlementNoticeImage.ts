import { readFile } from "fs/promises";
import path from "path";

const NOTICE_IMAGE_PATH = path.join(process.cwd(), "public", "settlement-notice.png");

/**
 * 정산서 PDF/이메일 맨 아래에 넣는 안내·홍보 이미지. `public/settlement-notice.png` 파일을
 * 교체하는 것만으로 넣고 뺄 수 있다(코드/환경변수 수정, 재배포 시 커밋만 하면 됨) - 파일이 없으면
 * null을 반환해 호출부가 조용히 건너뛴다.
 */
export async function readSettlementNoticeImage(): Promise<Buffer | null> {
  try {
    return await readFile(NOTICE_IMAGE_PATH);
  } catch {
    return null;
  }
}
