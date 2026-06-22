import dispatch from './dispatch.js';
import literals from './literals.js';
import operators from './operators.js';
import assign from './assign.js';

export default {
  ...dispatch,
  ...literals,
  ...operators,
  ...assign,
};
