// mupdf-wasm.js는 브라우저에서는 실행되지 않는 Node 전용 분기(`if (m) { await import("module") }`)
// 안에서만 Node의 내장 "module"을 쓴다. 번들러는 그 분기가 런타임에 실행되지 않는다는 걸 모르고
// 정적으로 "module"을 찾으려다 실패하므로(Module not found: Can't resolve 'module'), 클라이언트
// 번들에서만 이 빈 스텁으로 대신 연결한다(next.config.mjs의 turbopack.resolveAlias).
export function createRequire() {
  throw new Error("createRequire is not available in the browser");
}
