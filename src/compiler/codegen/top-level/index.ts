// @ts-nocheck — Stage 6: mixin file, types added in Stage 8
import program from './program.js';
import dispatch from './dispatch.js';
import class_ from './class.js';
import decorators from './decorators.js';
import typesAlias from './types-alias.js';
import func from './func.js';

export default {
  ...program,
  ...dispatch,
  ...class_,
  ...decorators,
  ...typesAlias,
  ...func,
};
