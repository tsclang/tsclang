// matrix.ts — value matrix: the single source of truth for per-type literal
// cases. The 02-variables suites (range-values / invalid-values /
// alternative-literals) iterate this data instead of hardcoding drift-prone
// copies, and cast-pair suites reuse the `valid` anchors.
//
// All values are SOURCE STRINGS, not JS numbers: printed expectations of
// decimal types (d8 0 -> "0.00") and the exact 64-bit bounds (u64 max) are
// not representable as JS doubles.

/** Literal cases for one type. */
export interface TypeCases {
  type: string
  /** Honest bounds as source literals (n-suffix where a JS number would
   *  lose precision). Documentation anchors — the literals themselves live
   *  in `valid`/`outOfRange`; `min`/`max` are for describe() titles. */
  min?: string
  max?: string
  /** In-range literals: [source, expected console.log output]. */
  valid: [string, string][]
  /** Out-of-range literals — each must fail with error[E101]. */
  outOfRange: string[]
  /** Wrong-type initializers: [source, expected error code]. */
  invalidValues: [string, string?][]
  /** Alternative-radix literals (hex/binary/octal): [source, expected output]. */
  altLiterals: [string, string][]
}

// Wrong-type initializers shared by every numeric-ish type: booleans and
// strings are E124 in checkInitMismatch (semantics.ts).
const WRONG_TYPE: [string, string?][] = [["true", "E124"], ['"hello"', "E124"]]

export const matrix: Record<string, TypeCases> = {
  i8: {
    type: "i8", min: "-128", max: "127",
    valid: [["0", "0"], ["1", "1"], ["-128", "-128"], ["127", "127"]],
    outOfRange: ["-129", "128"],
    invalidValues: WRONG_TYPE,
    altLiterals: [["0x0F", "15"], ["0b1001", "9"], ["0o17", "15"], ["0x7F", "127"]],
  },
  i16: {
    type: "i16", min: "-32768", max: "32767",
    valid: [["0", "0"], ["1", "1"], ["-32768", "-32768"], ["32767", "32767"]],
    outOfRange: ["-32769", "32768"],
    invalidValues: WRONG_TYPE,
    altLiterals: [["0x0F", "15"], ["0b1001", "9"], ["0o17", "15"], ["0x7FFF", "32767"]],
  },
  i32: {
    type: "i32", min: "-2147483648", max: "2147483647",
    valid: [["0", "0"], ["1", "1"], ["-2147483648", "-2147483648"], ["2147483647", "2147483647"]],
    outOfRange: ["-2147483649", "2147483648"],
    invalidValues: WRONG_TYPE,
    altLiterals: [["0x0F", "15"], ["0b1001", "9"], ["0o17", "15"], ["0x7FFFFFFF", "2147483647"]],
  },
  i64: {
    type: "i64", min: "-9223372036854775808n", max: "9223372036854775807n",
    valid: [["0", "0"], ["1", "1"], ["-9223372036854775808n", "-9223372036854775808"], ["9223372036854775807n", "9223372036854775807"]],
    outOfRange: ["-9223372036854775809n", "9223372036854775808n"],
    invalidValues: WRONG_TYPE,
    altLiterals: [["0x0F", "15"], ["0b1001", "9"], ["0o17", "15"], ["0x7FFFFFFFFFFFFFFF", "9223372036854775807"]],
  },
  u8: {
    type: "u8", min: "0", max: "255",
    valid: [["0", "0"], ["1", "1"], ["255", "255"]],
    outOfRange: ["256", "-1"],
    // multi-char strings into u8 are E102 (codegen), like char — semantics
    // delegates single-char string conversion to the richer codegen check
    invalidValues: [["true", "E124"], ['"hello"', "E102"]],
    altLiterals: [["0xFF", "255"], ["0b11111111", "255"], ["0o377", "255"], ["0x0A", "10"]],
  },
  u16: {
    type: "u16", min: "0", max: "65535",
    valid: [["0", "0"], ["1", "1"], ["65535", "65535"]],
    outOfRange: ["65536", "-1"],
    invalidValues: WRONG_TYPE,
    altLiterals: [["0xFFFF", "65535"], ["0b1000000000000000", "32768"], ["0o177777", "65535"], ["0x0A", "10"]],
  },
  u32: {
    type: "u32", min: "0", max: "4294967295",
    valid: [["0", "0"], ["1", "1"], ["4294967295", "4294967295"]],
    outOfRange: ["4294967296", "-1"],
    invalidValues: WRONG_TYPE,
    altLiterals: [["0xFFFFFFFF", "4294967295"], ["0b10000000000000000000000000000000", "2147483648"], ["0o37777777777", "4294967295"]],
  },
  u64: {
    type: "u64", min: "0", max: "18446744073709551615n",
    valid: [["0", "0"], ["1", "1"], ["18446744073709551615n", "18446744073709551615"]],
    outOfRange: ["18446744073709551616n", "-1"],
    invalidValues: WRONG_TYPE,
    altLiterals: [["0xFFFFFFFFFFFFF", "4503599627370495"], ["0b1001", "9"], ["0o17", "15"]],
  },
  d8: {
    type: "d8", min: "-1.27", max: "1.27",
    valid: [["0", "0.00"], ["0.01", "0.01"], ["0.5", "0.50"], ["1.27", "1.27"], ["-1.27", "-1.27"]],
    outOfRange: ["1.28", "-1.29"],
    invalidValues: WRONG_TYPE,
    altLiterals: [],
  },
  d16: {
    type: "d16", min: "-327.67", max: "327.67",
    valid: [["0", "0.00"], ["0.01", "0.01"], ["1.5", "1.50"], ["327.67", "327.67"], ["-327.67", "-327.67"]],
    outOfRange: ["327.68", "-327.69"],
    invalidValues: WRONG_TYPE,
    altLiterals: [],
  },
  d32: {
    type: "d32", min: "-214748.3647", max: "214748.3647",
    valid: [["0", "0.0000"], ["0.0001", "0.0001"], ["1.5", "1.5000"], ["3.14", "3.1400"], ["214748.3647", "214748.3647"], ["-214748.3647", "-214748.3647"]],
    outOfRange: ["214748.3648"],
    invalidValues: WRONG_TYPE,
    altLiterals: [],
  },
  d64: {
    type: "d64", min: "-92233720368.54775808", max: "92233720368.54775807",
    // Exact d64 bounds are not expressible as a JS double literal — only
    // deterministic values; range checks live with i64/u64.
    valid: [["0", "0.00000000"], ["0.1", "0.10000000"], ["1.5", "1.50000000"], ["3.14", "3.14000000"]],
    outOfRange: [],
    invalidValues: WRONG_TYPE,
    altLiterals: [],
  },
  f32: {
    type: "f32",
    // Float bounds print in %e form — only deterministic values here
    valid: [["1.5", "1.5"], ["Infinity", "Infinity"], ["-Infinity", "-Infinity"], ["NaN", "NaN"]],
    outOfRange: [],
    invalidValues: WRONG_TYPE,
    altLiterals: [],
  },
  f64: {
    type: "f64",
    valid: [["1.5", "1.5"], ["Infinity", "Infinity"], ["-Infinity", "-Infinity"], ["NaN", "NaN"]],
    outOfRange: [],
    invalidValues: WRONG_TYPE,
    altLiterals: [],
  },
  number: {
    type: "number",
    valid: [["0", "0"], ["1", "1"], ["2", "2"]],
    outOfRange: [],
    invalidValues: WRONG_TYPE,
    altLiterals: [],
  },
  boolean: {
    type: "boolean",
    valid: [["true", "true"], ["false", "false"]],
    outOfRange: [],
    invalidValues: [["42", "E124"], ['"hello"', "E124"]],
    altLiterals: [],
  },
  string: {
    type: "string",
    valid: [['""', ""], ['"hello"', "hello"]],
    outOfRange: [],
    invalidValues: [["42", "E124"], ["true", "E124"]],
    altLiterals: [],
  },
  char: {
    type: "char",
    valid: [["'A'", "A"], ["65", "A"]],
    // char bounds are enforced by E124 (semantics: 'out-of-range number'),
    // not the E101 literal-range check — see invalidValues
    outOfRange: [],
    invalidValues: [["256", "E124"], ["true", "E124"], ['"hello"', "E102"]],
    altLiterals: [],
  },
  usize: {
    type: "usize", min: "0", max: "18446744073709551615",
    // max is a plain literal: n-suffix is i64/u64-only (E124) — the value
    // itself stays exact because tokens carry the raw text
    valid: [["0", "0"], ["1", "1"], ["18446744073709551615", "18446744073709551615"]],
    outOfRange: ["-1", "18446744073709551616"],
    invalidValues: WRONG_TYPE,
    altLiterals: [["0xFF", "255"]],
  },
  isize: {
    type: "isize", min: "-9223372036854775808", max: "9223372036854775807",
    valid: [["0", "0"], ["1", "1"], ["-1", "-1"], ["4294967295", "4294967295"], ["-4294967296", "-4294967296"]],
    outOfRange: ["9223372036854775808"],
    invalidValues: WRONG_TYPE,
    altLiterals: [["0x7F", "127"]],
  },
}

const ALL_NUMERIC_TYPES = ["i8", "i16", "i32", "i64", "u8", "u16", "u32", "u64", "f32", "f64", "d8", "d16", "d32", "d64"]

/** Printf-safe numeric types for a capability profile. This is NOT the same
 *  as "types the profile can store": i16/u16/d16 deliberately stay available
 *  at bits:8 because the rule is about console.log promotion — avr-gcc's int
 *  (the default promotion target of %d) is 16-bit, so i16/u16 still print
 *  losslessly there. Everything wider than the target's int is filtered. */
export function filterValidTypes(caps: { fpu?: boolean; bits?: number }): string[] {
  let types = [...ALL_NUMERIC_TYPES]
  if (caps.fpu === false) {
    types = types.filter(t => t !== "f32" && t !== "f64")
  }
  if (caps.bits !== undefined && caps.bits < 64) {
    types = types.filter(t => t !== "i64" && t !== "u64" && t !== "d64")
  }
  if (caps.bits !== undefined && caps.bits < 32) {
    types = types.filter(t => t !== "i32" && t !== "u32" && t !== "d32")
  }
  return types
}
