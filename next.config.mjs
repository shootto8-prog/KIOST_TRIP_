/** @type {import('next').NextConfig} */
const nextConfig = {
  // 개발서버 보안 기능: 기본적으로 localhost 외 다른 주소(사내망 IP 등)에서 오는 요청은
  // 막힌다(외부 공격 방지용). 사무실 동료가 http://10.100.3.140:3001 로 접속해 테스트할 수
  // 있도록 허용 목록에 추가. 다른 IP에서 접속하는 동료가 늘어나면 이 배열에 추가하면 된다.
  allowedDevOrigins: ["10.100.3.140"],
  // 네이티브(sharp) 모듈은 번들러가 건드리면 런타임에 깨지므로 서버 외부 패키지로 남겨둔다.
  // 정산서 하단 안내 이미지 축소에 쓴다(영수증 사진 처리는 전부 브라우저로 옮겨갔다).
  serverExternalPackages: ["sharp"],
  // mupdf(WASM)는 이제 클라이언트에서도 쓴다(PDF 첨부 영수증 변환) - mupdf-wasm.js의 Node 전용
  // 분기가 Node 내장 "module"을 동적 import하는데, 번들러가 그 분기의 조건이 브라우저에서는
  // 항상 false라는 걸 모르고 정적으로 해석을 시도하다 실패한다. 브라우저 빌드에서만 빈 스텁으로
  // 바꿔치기해 빌드가 깨지지 않게 한다.
  turbopack: {
    resolveAlias: {
      module: { browser: "./src/lib/emptyNodeModuleShim.js" },
    },
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "15mb",
    },
  },
};

export default nextConfig;
