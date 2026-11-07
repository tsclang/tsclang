export const install = `tsclang install — Install a package

USAGE:
  tsclang install [name[@version] | file.tspkg | git+URL] [--production]

WITHOUT A NAME:
  Sync tsc.package.lock with dependencies/devDependencies of tsc.package.json.

WITH A NAME:
  Adds the package to dependencies of tsc.package.json (npm semantics;
  a minimal manifest is created when absent), pins the resolved exact
  version in the lock and creates tsc_packages/<name>/.

OPTIONS:
  --production    Install only dependencies, skip devDependencies`;
