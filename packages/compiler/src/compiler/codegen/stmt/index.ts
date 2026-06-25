import vardecl      from './vardecl.js';
import destruct     from './destruct.js';
import controlFlow  from './control-flow.js';
import match        from './match.js';

export default {
  ...vardecl,
  ...destruct,
  ...controlFlow,
  ...match,
};
