export const update = `tsclang update — Update lock file

USAGE:
  tsclang update [name]

Re-resolves the version range from tsc.package.json against the registry
and writes the exact version to the lock. Without a name, updates every
dependency and syncs the lock with the manifest (auto-install).`;
