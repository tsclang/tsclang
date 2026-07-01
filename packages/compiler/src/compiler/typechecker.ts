import resolve from './codegen/types/resolve.js';
import infer from './codegen/types/infer.js';
import type { CodeGenThis } from './codegen.js';

// TypeChecker wraps Context's type-checking methods (resolve + infer mixins).
// Methods are bound to ctx so `this` inside them is the Context object.
export class TypeChecker {
  // Mixin methods (bound to ctx in constructor)
  declare resolveType: (...args: unknown[]) => string;
  declare resolveTupleType: (...args: unknown[]) => string;
  declare typeDecl: (...args: unknown[]) => string;
  declare inferType: (...args: unknown[]) => string;
  declare _effectiveType: (...args: unknown[]) => string;
  declare _inferCall: (...args: unknown[]) => string;
  declare _inferMemberCall: (...args: unknown[]) => string;
  declare inferTypeWithParams: (...args: unknown[]) => string;

  constructor(ctx: CodeGenThis) {
    for (const [name, fn] of Object.entries({ ...resolve, ...infer })) {
      if (typeof fn === 'function') {
        (this as Record<string, unknown>)[name] = fn.bind(ctx);
      }
    }
  }
}
