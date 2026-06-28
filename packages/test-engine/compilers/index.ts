import { register } from "./registry.js"
import { GccBackend } from "./gcc.js"
import { ClangBackend } from "./clang.js"
import { MsvcBackend } from "./msvc.js"
import { AvrGccBackend } from "./avr-gcc.js"
import { WasmBackend } from "./wasm.js"

export type { CompilerBackend, CompileOpts, CompileResult, RunOpts, RunResult } from "./interface.js"
export { register, getBackend, listAvailable, listAll } from "./registry.js"
export { getDefaultCompiler, isInPath, isInWsl, findMsVC, normalizeC } from "./utils.js"

export function registerAll(): void {
  register(new GccBackend())
  register(new ClangBackend())
  register(new MsvcBackend())
  register(new AvrGccBackend())
  register(new WasmBackend())
}
