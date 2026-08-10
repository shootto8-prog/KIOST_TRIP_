import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as XLSX from "xlsx";

/**
 * TRANS/*.xls(구간별 정액 요금표, 담당 부서가 관리)를 앱이 번들로 쓰는 JSON으로 변환한다.
 * 요금표가 갱신되면: 1) TRANS 폴더의 xls 파일을 새 파일로 교체 2) `npm run sync:fares` 실행
 * 3) 평소처럼 빌드/배포. 원본 엑셀 구조(교통편/구간/금액 열)만 맞으면 코드 수정 없이 반영된다.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const TRANS_DIR = path.join(ROOT, "TRANS");
const OUT_PATH = path.join(ROOT, "src", "data", "transportFares.json");

function readSheet(filePath, sheetName) {
  const buf = readFileSync(filePath);
  const wb = XLSX.read(buf, { type: "buffer" });
  const name = sheetName ?? wb.SheetNames[0];
  const sheet = wb.Sheets[name];
  if (!sheet) throw new Error(`${filePath}: 시트 "${name}"을 찾을 수 없습니다.`);
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
}

/** BUS.xls / CAR.xls - 헤더: 교통편, 구간, <단일요금>. */
function parseFlatFareFile(filePath) {
  const rows = readSheet(filePath);
  const out = [];
  for (const row of rows.slice(1)) {
    const [, route, fare] = row;
    if (!route || typeof fare !== "number") continue;
    out.push({ route: String(route).trim(), fare });
  }
  return out;
}

/** ktx.xls / train.xls - 헤더: 교통편, 구간, 책임급, 선임급 이하. */
function parseGradedFareFile(filePath, source) {
  const rows = readSheet(filePath);
  const out = [];
  for (const row of rows.slice(1)) {
    const [, route, senior, junior] = row;
    if (!route || typeof senior !== "number" || typeof junior !== "number") continue;
    out.push({ route: String(route).trim(), fareSenior: senior, fareJunior: junior, source });
  }
  return out;
}

const bus = parseFlatFareFile(path.join(TRANS_DIR, "BUS.xls"));
const car = parseFlatFareFile(path.join(TRANS_DIR, "CAR.xls"));
const ktx = parseGradedFareFile(path.join(TRANS_DIR, "ktx.xls"), "KTX");
const train = parseGradedFareFile(path.join(TRANS_DIR, "train.xls"), "TRAIN");

const data = {
  generatedAt: new Date().toISOString(),
  bus,
  car,
  rail: [...ktx, ...train],
};

writeFileSync(OUT_PATH, JSON.stringify(data));
console.log(
  `transportFares.json 생성 완료: 버스 ${bus.length}건, 승용 ${car.length}건, ` +
    `고속철도/기차 ${data.rail.length}건 (KTX ${ktx.length} + 기차 ${train.length})`
);
