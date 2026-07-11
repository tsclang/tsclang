import { describe, test } from "@tsclang/test-engine"
import { DIAGNOSTICS, resolveDiagnostic, explainError, lookupDiagnostic, type DiagnosticCode } from "@tsclang/compiler"

const entries = Object.entries(DIAGNOSTICS) as [string, typeof DIAGNOSTICS[DiagnosticCode]][]

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg)
}

describe("diagnostics registry — structural integrity", () => {
  test("every entry has required fields", () => {
    for (const [key, entry] of entries) {
      assert(typeof entry.code === "string" && entry.code.length > 0, `${key}: missing code`)
      assert(typeof entry.severity === "string", `${key}: missing severity`)
      assert(typeof entry.title === "string" && entry.title.length > 0, `${key}: missing title`)
      assert(typeof entry.message === "string" && entry.message.length > 0, `${key}: missing message`)
      assert(typeof entry.body === "string" && entry.body.trim().length > 0, `${key}: missing body`)
    }
  })

  test("entry.code matches its key", () => {
    for (const [key, entry] of entries) {
      assert(entry.code === key, `${key}: code "${entry.code}" !== key "${key}"`)
    }
  })

  test("no duplicate codes", () => {
    const codes = entries.map(([k]) => k)
    const unique = new Set(codes)
    assert(unique.size === codes.length, `duplicate codes found: ${codes.length - unique.size}`)
  })

  test("E-prefixed codes have severity 'error'", () => {
    for (const [key, entry] of entries) {
      if (key.startsWith("E")) {
        assert(entry.severity === "error", `${key}: expected severity 'error', got '${entry.severity}'`)
      }
    }
  })

  test("W-prefixed codes have severity 'warning'", () => {
    for (const [key, entry] of entries) {
      if (key.startsWith("W")) {
        assert(entry.severity === "warning", `${key}: expected severity 'warning', got '${entry.severity}'`)
      }
    }
  })

  test("title is non-empty for every entry", () => {
    for (const [, entry] of entries) {
      assert(entry.title.length > 0, `${entry.code}: empty title`)
    }
  })

  test("message is non-empty for every entry", () => {
    for (const [, entry] of entries) {
      assert(entry.message.length > 0, `${entry.code}: empty message`)
    }
  })

  test("body is non-empty for every entry", () => {
    for (const [, entry] of entries) {
      assert(entry.body.trim().length > 0, `${entry.code}: empty body`)
    }
  })

  test("registry has at least 80 codes", () => {
    assert(entries.length >= 80, `expected >= 80 codes, got ${entries.length}`)
  })
})

describe("resolveDiagnostic", () => {
  test("resolves a known code with params", () => {
    const r = resolveDiagnostic("E002", { name: "x" })
    assert(r !== null, "E002 should resolve")
    assert(r!.code === "E002", `code mismatch: ${r!.code}`)
    assert(r!.severity === "error", `severity mismatch: ${r!.severity}`)
    assert(r!.message.includes("x"), `message should contain 'x': ${r!.message}`)
  })

  test("resolves a known code without params (placeholders left as-is)", () => {
    const r = resolveDiagnostic("E001")
    assert(r !== null, "E001 should resolve")
    assert(r!.code === "E001", `code mismatch: ${r!.code}`)
    assert(r!.message.includes("{name}"), `message should contain '{{name}': ${r!.message}`)
  })

  test("case-insensitive lookup", () => {
    const r = resolveDiagnostic("e002", { name: "y" })
    assert(r !== null, "e002 should resolve")
    assert(r!.message.includes("y"), `message should contain 'y': ${r!.message}`)
  })

  test("returns null for unknown code", () => {
    assert(resolveDiagnostic("E999") === null, "E999 should return null")
  })

  test("substitutes params in help lines", () => {
    const r = resolveDiagnostic("E022", { name: "w" })
    assert(r !== null, "E022 should resolve")
    assert(r!.help.some(h => h.includes("upgrade")), "help should mention upgrade")
  })

  test("resolveDiagnostic consistent with lookupDiagnostic", () => {
    for (const [key] of entries) {
      const resolved = resolveDiagnostic(key)
      const looked = lookupDiagnostic(key)
      assert(resolved !== null, `${key}: resolveDiagnostic returned null`)
      assert(looked !== null, `${key}: lookupDiagnostic returned null`)
      assert(resolved!.code === looked!.code, `${key}: code mismatch`)
      assert(resolved!.severity === looked!.severity, `${key}: severity mismatch`)
      assert(resolved!.title === looked!.title, `${key}: title mismatch`)
    }
  })
})

describe("explainError", () => {
  test("returns formatted text for known code", () => {
    const text = explainError("E001")
    assert(text !== null, "E001 should explain")
    assert(text!.includes("E001"), `text should contain code: ${text}`)
    assert(text!.includes("const"), `text should contain title keyword: ${text}`)
  })

  test("returns null for unknown code", () => {
    assert(explainError("E999") === null, "E999 should return null")
  })
})
