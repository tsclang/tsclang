export const OPTIMIZE_LEVELS = ['O0', 'O1', 'O2', 'O3', 'Os', 'Oz'] as const;

export type OptimizeLevel = typeof OPTIMIZE_LEVELS[number];
