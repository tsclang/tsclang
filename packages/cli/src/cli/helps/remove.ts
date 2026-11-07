export const remove = `tsclang remove — Remove a package

USAGE:
  tsclang remove <name>

Removes the package from dependencies/devDependencies of tsc.package.json,
from tsc.package.lock and deletes tsc_packages/<name>/. No confirmation
prompt: the operation is local and reversible via tsclang install <name>.`;
