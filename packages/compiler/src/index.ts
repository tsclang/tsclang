// @tsclang/compiler — public library API.
// Thin barrel re-exporting the compiler front-end and diagnostics surface.
// CLI, test-engine and the spec test runner import from here.

export { lex } from './compiler/lexer.js';
export { parse } from './compiler/parser.js';
export { codegen } from './compiler/codegen.js';
export { compileTsc, findPackageJson } from './compiler/compile.js';
export { renderDiagnostic, TscError } from './compiler/error.js';
export { explainError, ERROR_CATALOG } from './compiler/error-catalog.js';
export { lint, applyFixes } from './compiler/linter.js';
export { emitDtsSync } from './compiler/dts-emitter.js';
export { parsePlatformDecl } from './compiler/profile.js';
export { setColorEnabled } from './compiler/colors.js';
