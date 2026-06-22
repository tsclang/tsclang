// @ts-nocheck — Stage 6: mixin file, types added in Stage 8
import newExpr from './new-expr.js';
import arrays from './arrays.js';
import closures from './closures.js';
import emitHelpers from './emit-helpers.js';

export default {
  ...newExpr,
  ...arrays,
  ...closures,
  ...emitHelpers,
};
