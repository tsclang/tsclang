import resolve from './codegen/types/resolve.js';
import infer from './codegen/types/infer.js';
import type { CodeGenThis } from './codegen.js';

// TypeChecker wraps Context's type-checking methods (resolve + infer mixins).
// Methods are bound to ctx so `this` inside them is the Context object.
export class TypeChecker {
  // Mixin methods (bound to ctx in constructor)
  declare resolveType: (...args: any[]) => string;
  declare resolveTupleType: (...args: any[]) => string;
  declare typeDecl: (...args: any[]) => string;
  declare inferType: (...args: any[]) => string;
  declare _effectiveType: (...args: any[]) => string;
  declare _inferCall: (...args: any[]) => string;
  declare _inferMemberCall: (...args: any[]) => string;
  declare inferTypeWithParams: (...args: any[]) => string;

  constructor(ctx: CodeGenThis) {
    for (const [name, fn] of Object.entries({ ...resolve, ...infer })) {
      if (typeof fn === 'function') {
        (this as Record<string, unknown>)[name] = fn.bind(ctx);
      }
    }
  }
}
