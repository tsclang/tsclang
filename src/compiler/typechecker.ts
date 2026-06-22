import resolve from './codegen/types/resolve.js';
import infer from './codegen/types/infer.js';

export class TypeChecker {
  ctx: any;

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
