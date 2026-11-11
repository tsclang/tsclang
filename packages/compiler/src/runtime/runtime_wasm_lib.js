// Emscripten JS library for the TSClang wasm runtime (#278).
// runtime_wasm.h imports env.log(ptr, len) (import_module("env") /
// import_name("log")) for console.log; emcc needs a JS definition of every
// referenced symbol, so the build passes this file via --js-library.

mergeInto(LibraryManager.library, {
  log(ptr, len) {
    const bytes = HEAPU8.subarray(ptr, ptr + len);
    console.log(
      typeof TextDecoder !== 'undefined'
        ? new TextDecoder('utf-8').decode(bytes)
        : String.fromCharCode.apply(null, bytes)
    );
  },
});
