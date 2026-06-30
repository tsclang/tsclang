# Changesets

This folder is used by [Changesets](https://github.com/changesets/changesets) to manage versioning and releases.

## How it works

When you make a change that should be released:

1. Run `pnpm changeset`
2. Select the packages that changed
3. Select the bump type (major, minor, patch)
4. Write a summary of the change
5. Commit the generated `.changeset/*.md` file

When ready to release:

1. Run `pnpm changeset version` — consumes changesets, updates versions and CHANGELOG.md
2. Run `pnpm publish -r` — publishes to npm

## Notes

- All `@tsclang/*` packages use **fixed** (lockstep) versioning — they always release together at the same version.
- `@tsclang/spec`, `@tsclang/tests`, `@tsclang/test-engine` are ignored (internal, not published).
