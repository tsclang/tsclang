import { register } from "./registry.js"
import { GccLikeBackend } from "./gcc-like.js"
import { MsvcBackend } from "./msvc.js"
import { AvrGccBackend } from "./avr-gcc.js"
import { WasmBackend } from "./wasm.js"

export type { CompilerBackend, CompileOpts, CompileResult, RunOpts, RunResult } from "./interface.js"
export { register, getBackend, listAvailable, listAll } from "./registry.js"
export { getDefaultCompiler, isInPath, isInWsl, findMsVC, normalizeC, toWslPath } from "./utils.js"

export function registerAll(): void {
  register(new GccLikeBackend("gcc"))
  register(new GccLikeBackend("clang"))
  register(new MsvcBackend())
  register(new AvrGccBackend())
  register(new WasmBackend())
}
