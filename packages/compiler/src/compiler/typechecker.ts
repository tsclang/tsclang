import resolve from './codegen/types/resolve.js';
import infer from './codegen/types/infer.js';

export class TypeChecker {
  ctx: any;
  // Mixin methods (from resolve.ts + infer.ts via Object.assign)
  declare resolveType: (...args: any[]) => string;
  declare resolveTupleType: (...args: any[]) => string;
  declare typeDecl: (...args: any[]) => string;
  declare inferType: (...args: any[]) => string;
  declare _effectiveType: (...args: any[]) => string;
  declare _inferCall: (...args: any[]) => string;
  declare _inferMemberCall: (...args: any[]) => string;
  declare inferTypeWithParams: (...args: any[]) => string;

  constructor(ctx: any) {
    this.ctx = ctx;

    return new Proxy(this, {
      get(target, prop, receiver) {
        if (prop in target) {
          return Reflect.get(target, prop, receiver);
        }
        const c = target.ctx;
        if (typeof prop !== 'symbol' && prop in c) {
          const val = c[prop];
          return typeof val === 'function' ? val.bind(c) : val;
        }
        return undefined;
      },
      has(target, prop) {
        return prop in target || prop in target.ctx;
      },
    });
  }
}

Object.assign(TypeChecker.prototype, resolve, infer);
