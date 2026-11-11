// `tsclang platform` — first nested command group (#265).
// Platforms are packages: install/search/remove/list against the platform
// registry and the project's tsc_packages (spec 13-build.md, «Реестр»).

export const platformGroup = `tsclang platform — manage platform packages

USAGE:
  tsclang platform <command> [options]

COMMANDS:
  install <name>   Install a platform package into tsc_packages, add its
                   builds/scripts to tsc.package.json, optionally download
                   toolchains into ~/.tsclang/platforms/
  search <query>   Search the platform registry
  list             List installed platforms and their toolchain state
  remove <name>    Remove a platform and clean up the manifest entries it owns

OPTIONS:
  --help, -h       Print this help

Run 'tsclang platform <command> --help' for command-specific options.`;

export const platformInstall = `tsclang platform install — install a platform package

USAGE:
  tsclang platform install <name> [options]

Installs the platform package into tsc_packages/, records it in dependencies,
and appends the builds/scripts presets from its 'platform' section using the
docker-model names (official @tsclang/* unprefixed, foreign scopes prefixed
'<user>:'). Existing manifest entries are never overwritten; conflicts are
skipped with a notice (or asked on a TTY). Missing toolchains are offered for
download into ~/.tsclang/platforms/<platform>@<v>/<toolchain>@<v>.

OPTIONS:
  --help, -h       Print this help`;

export const platformSearch = `tsclang platform search — search the platform registry

USAGE:
  tsclang platform search [query]

Lists platform packages from the registry catalog matching the query.
Works offline from cache; --offline / TSC_NO_NETWORK disables all network.

OPTIONS:
  --help, -h       Print this help`;

export const platformRemove = `tsclang platform remove — remove an installed platform

USAGE:
  tsclang platform remove <name>

Removes the platform package and the builds/scripts entries it created
(lock keeps a snapshot per entry; entries the user edited are left alone
with a warning).

OPTIONS:
  --help, -h       Print this help`;

export const platformList = `tsclang platform list — installed platforms

USAGE:
  tsclang platform list

Lists platform packages installed in tsc_packages/ with their profiles and
toolchain state (isolated under ~/.tsclang/platforms/ or system-wide).

OPTIONS:
  --help, -h       Print this help`;
