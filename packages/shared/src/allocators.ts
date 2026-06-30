export const ALLOCATOR_TYPES = ['heap', 'static', 'default'] as const;

export type Allocator = typeof ALLOCATOR_TYPES[number];
