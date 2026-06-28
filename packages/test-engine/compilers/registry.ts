import type { CompilerBackend } from "./interface.js"

const backends = new Map<string, CompilerBackend>()

export function register(backend: CompilerBackend): void {
  backends.set(backend.name, backend)
}

export function getBackend(name: string): CompilerBackend | undefined {
  return backends.get(name)
}

export function listAvailable(): string[] {
  return [...backends.values()].filter(b => b.isAvailable()).map(b => b.name)
}

export function listAll(): string[] {
  return [...backends.keys()]
}
