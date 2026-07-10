// @tsclang/compiler — public library API.
// Thin barrel re-exporting the compiler front-end and diagnostics surface.
// CLI, test-engine and the spec test runner import from here.

export { lex } from './compiler/lexer.js';
export { parse } from './compiler/parser.js';
export { codegen, DESKTOP_CAPABILITIES } from './compiler/codegen.js';
export { compileTsc, findPackageJson } from './compiler/compile.js';
export { renderDiagnostic, TscError } from './compiler/error.js';
export type { DiagSpan, TscErrorOptions, Diagnostic, RenderOptions } from './compiler/error.js';
export { DIAGNOSTICS, lookupDiagnostic, explainError, substituteParams } from './compiler/diagnostics.js';
export type { DiagnosticEntry, Severity } from './compiler/diagnostics.js';
export { DIAGNOSTICS as ERROR_CATALOG } from './compiler/diagnostics.js';
export { lint, applyFixes } from './compiler/linter.js';
export { emitDtsSync } from './compiler/dts-emitter.js';
export { parsePlatformDecl, capabilityDefines } from './compiler/profile.js';
export type { Capabilities } from './compiler/profile.js';
export { setColorEnabled } from './compiler/colors.js';
