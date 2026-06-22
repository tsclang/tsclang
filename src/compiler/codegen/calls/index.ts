import callDispatch    from './call-dispatch.js';
import methodDispatch  from './method-dispatch.js';
import consoleMixin    from './console.js';
import builtinHelpers  from './builtin-helpers.js';
import concurrency     from './concurrency.js';
import builtin         from './builtin.js';
import stdlib          from './stdlib.js';
import conversion      from './conversion.js';

export default {
  ...callDispatch,
  ...methodDispatch,
  ...consoleMixin,
  ...builtinHelpers,
  ...concurrency,
  ...builtin,
  ...stdlib,
  ...conversion,
};
