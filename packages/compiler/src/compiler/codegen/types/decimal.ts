import type { CodeGenContext } from '../../codegen.js';

// decimal.ts — Decimal fixed-point type helpers

const DECIMAL_SCALES: Record<string, number> = {
  'd8_t': 100,
  'd16_t': 100,
  'd32_t': 10000,
  'd64_t': 100000000,
};

const DECIMAL_DECIMALS: Record<string, number> = {
  'd8_t': 2,
  'd16_t': 2,
  'd32_t': 4,
  'd64_t': 8,
};

export function isDecimal(ctype: string): boolean {
  return ctype in DECIMAL_SCALES;
}

// Resolve scalar aliases (type Money = d32) to their base decimal C type.
// Returns the base type ('d32_t') if the ctype is or aliases a decimal, null otherwise.
export function resolveDecimalBase(ctx: CodeGenContext, ctype: string | null | undefined): string | null {
  if (!ctype) return null;
  if (DECIMAL_SCALES[ctype]) return ctype;
  const alias = ctx.classes.get(ctype);
  if (alias?.isScalarAlias && alias.innerType && DECIMAL_SCALES[alias.innerType]) {
    return alias.innerType;
  }
  return null;
}

export function decimalScale(ctype: string): number | null {
  return DECIMAL_SCALES[ctype] ?? null;
}

export function decimalDecimals(ctype: string): number | null {
  return DECIMAL_DECIMALS[ctype] ?? null;
}

// Convert a numeric literal string to a scaled integer string
// Example: ("1.5", 10000) -> "15000", ("3", 10000) -> "30000"
export function scaleLiteral(value: string, scale: number): string {
  let v = value;
  // Strip underscores
  v = v.replace(/_/g, '');
  // Handle hex/octal — not valid for decimal, but let it fall through to int
  if (v.startsWith('0x') || v.startsWith('0X') || v.startsWith('0o') || v.startsWith('0O')) {
    const fval = parseFloat(v);
    return String(Math.round(fval * scale));
  }
  const fval = parseFloat(v);
  // Round-half-away-from-zero
  const scaled = fval >= 0 ? Math.floor(fval * scale + 0.5) : Math.ceil(fval * scale - 0.5);
  return String(BigInt(scaled));
}
