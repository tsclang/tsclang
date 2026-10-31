// MSYS2 bash helpers for Windows toolchains.
//
// On Windows, MSYS2 gcc does not work when spawned directly from node:
// gcc.exe starts, but cc1.exe fails silently because it needs the MSYS2
// runtime environment (status 1, empty stderr). All gcc-like invocations
// on win32 must go through `bash --login -c` with /mingw64/bin prepended
// to PATH. Binaries produced this way may also depend on msys DLLs, so
// running them through the same bash is the only universally safe path.
//
// Detection is cached; TSC_MSYS2_BASH env var overrides the default
// install location for non-standard MSYS2 roots.
import { spawnSync, type SpawnSyncReturns } from "child_process"
import { existsSync } from "fs"

let cachedBash: string | null | undefined

/** Detected MSYS2 bash.exe path on win32, or null when unavailable (cached). */
export function msys2Bash(): string | null {
  if (cachedBash !== undefined) return cachedBash
  let bash: string | null = null
  if (process.platform === "win32") {
    const env = process.env["TSC_MSYS2_BASH"]
    const candidates = env ? [env] : ["C:\\msys64\\usr\\bin\\bash.exe"]
    for (const candidate of candidates) {
      try {
        if (existsSync(candidate)) {
          bash = candidate
          break
        }
      } catch {
        // existsSync is defensive enough; ignore broken candidates
      }
    }
  }
  cachedBash = bash
  return bash
}

/** Convert a Windows path to an MSYS2 path (C:\foo\bar → /c/foo/bar). No-op elsewhere. */
export function toMsysPath(p: string): string {
  if (process.platform !== "win32") return p
  return p.replace(/^([A-Za-z]):[\\/]/, (_, d) => `/${d.toLowerCase()}/`).replace(/\\/g, "/")
}

/** Quote a value so bash -c treats it as exactly one word (handles spaces). */
export function shQuote(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'"
}

/** argv for MSYS2 bash: login shell, /mingw64/bin first on PATH, then run `script`. */
export function bashLoginArgs(script: string): string[] {
  return ["--login", "-c", `export PATH="/mingw64/bin:$PATH" && ${script}`]
}

/** Run a shell script through MSYS2 bash synchronously (win32 + bash present only). */
export function bashExec(script: string, timeoutMs?: number): SpawnSyncReturns<Buffer> {
  const bash = msys2Bash()
  if (!bash) {
    throw new Error("bashExec: MSYS2 bash not available (non-win32 or bash.exe not found)")
  }
  return spawnSync(bash, bashLoginArgs(script), { stdio: "pipe", timeout: timeoutMs })
}
