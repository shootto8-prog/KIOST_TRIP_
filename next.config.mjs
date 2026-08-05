/** @type {import('next').NextConfig} */
const nextConfig = {
  // 개발서버 보안 기능: 기본적으로 localhost 외 다른 주소(사내망 IP 등)에서 오는 요청은
  // 막힌다(외부 공격 방지용). 사무실 동료가 http://10.100.3.140:3001 로 접속해 테스트할 수
  // 있도록 허용 목록에 추가. 다른 IP에서 접속하는 동료가 늘어나면 이 배열에 추가하면 된다.
  allowedDevOrigins: ["10.100.3.140"],
  // 네이티브(sharp)·emscripten(heic-convert/libheif) 모듈은 번들러가 건드리면 런타임에
  // 깨지므로 서버 외부 패키지로 남겨둔다. 각각 정산서 PDF 이미지 축소, HEIC->JPEG 변환에 쓴다.
  serverExternalPackages: ["sharp", "heic-convert", "mupdf"],
  experimental: {
    serverActions: {
      bodySizeLimit: "15mb",
    },
  },
};

export default nextConfig;
