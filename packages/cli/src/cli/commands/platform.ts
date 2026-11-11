// `tsclang platform <sub>` — nested command group routing (#265).
// The dispatcher validates the subcommand and its flags before calling here.
// Skeleton stage: every subcommand is an explicit not-implemented stub;
// search/list land in #266, install in #267, remove in #268 — replace the
// stub body with the real parser when they arrive.

export const PLATFORM_SUBCOMMANDS = ['install', 'search', 'remove', 'list'] as const;

export function runPlatformCommand(sub: string): void {
  // Subcommand existence is checked by the dispatcher; keep a guard so the
  // module stays correct when called directly.
  if (!PLATFORM_SUBCOMMANDS.includes(sub as (typeof PLATFORM_SUBCOMMANDS)[number])) {
    console.error(`tsclang: unknown platform command '${sub}'`);
    process.exit(1);
  }
  console.error(`tsclang: platform ${sub} is not implemented yet`);
  process.exit(1);
}
