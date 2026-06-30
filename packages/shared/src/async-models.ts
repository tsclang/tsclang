export const ASYNC_MODELS = ['libuv', 'state_machine', 'none'] as const;

export type AsyncModel = typeof ASYNC_MODELS[number];
