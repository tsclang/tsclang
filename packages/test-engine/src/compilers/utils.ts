import { spawnSync, type SpawnSyncReturns } from "child_process"
import { existsSync } from "fs"
import { join } from "path"

export function isInPath(name: string): boolean {
  const cmd = process.platform === "win32" ? "where" : "which"
  const result = spawnSync(cmd, [name], { stdio: "pipe", shell: true })
  return result.status === 0
}

export function isInWsl(name: string): boolean {
  const result = spawnSync("wsl", ["which", name], { stdio: "pipe" })
  return result.status === 0
}

export function wslExec(cmd: string, args: string[]): SpawnSyncReturns<Buffer> {
  return spawnSync("wsl", [cmd, ...args], { stdio: "pipe" })
}

export function findMsVC(): { vcvarsall: string; cl: string } | null {
  const vswherePaths = [
    join(process.env["ProgramFiles(x86)"] || "", "Microsoft Visual Studio", "Installer", "vswhere.exe"),
    join(process.env["ProgramFiles"] || "", "Microsoft Visual Studio", "Installer", "vswhere.exe"),
  ]

  for (const vswhere of vswherePaths) {
    if (existsSync(vswhere)) {
      const result = spawnSync(vswhere, ["-latest", "-property", "installationPath"], { stdio: "pipe", shell: true })
      if (result.status === 0) {
        const installPath = result.stdout.toString().trim()
        if (installPath) {
          const vcvarsall = join(installPath, "VC", "Auxiliary", "Build", "vcvarsall.bat")
          const cl = join(installPath, "VC", "Tools", "MSVC", "bin", "Hostx64", "x64", "cl.exe")
          if (existsSync(cl)) {
            return { vcvarsall, cl }
          }
        }
      }
    }
  }

  if (process.env["VCINSTALLDIR"]) {
    const cl = join(process.env["VCINSTALLDIR"], "bin", "Hostx64", "x64", "cl.exe")
    if (existsSync(cl)) {
      return { vcvarsall: "", cl }
    }
  }

  return null
}

export function getDefaultCompiler(): string {
  switch (process.platform) {
    case "win32":
      if (findMsVC()) return "msvc"
      if (isInPath("gcc")) return "gcc"
      if (isInPath("clang")) return "clang"
      throw new Error("No C compiler found on Windows. Install MSVC, MinGW, or Clang.")
    case "darwin":
      if (isInPath("clang")) return "clang"
      if (isInPath("gcc")) return "gcc"
      throw new Error("No C compiler found on macOS. Install Xcode Command Line Tools.")
    default:
      if (isInPath("gcc")) return "gcc"
      if (isInPath("clang")) return "clang"
      throw new Error("No C compiler found. Install gcc or clang.")
  }
}

export function normalizeC(s: string): string {
  return s
    .split("\n")
    .map(line => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export function toWslPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^([A-Z]):/i, (_, d) => `/mnt/${d.toLowerCase()}`)
}
