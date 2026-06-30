import type { Target } from './targets.js';
import type { Allocator } from './allocators.js';
import type { AsyncModel } from './async-models.js';

export const DEFAULT_TARGET: Target = 'desktop';

export const DEFAULT_NUMBER = 'f64';

export const DEFAULT_ALLOCATOR: Allocator = 'heap';

export const DEFAULT_ASYNC: AsyncModel = 'libuv';

export const DEFAULT_USIZE = 'u64';

export const DEFAULT_BITS = 64;
