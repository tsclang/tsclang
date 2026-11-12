// `tsclang platform` — first nested command group (#265).
// Platforms are packages: install/update/search/remove/list against the
// platform registry and the project's tsc_packages (spec 13-build.md, «Реестр»).

export const platformGroup = `tsclang platform — manage platform packages

USAGE:
  tsclang platform <command> [options]

COMMANDS:
  install <name>   Install a platform package into tsc_packages, add its
                   builds/scripts to tsc.package.json, optionally download
                   toolchains into ~/.tsclang/platforms/
  update [name]    Update installed platforms to newer catalog versions
                   (ownership-aware; --yes for non-interactive use)
  search <query>   Search the platform registry
  list             List installed platforms and their toolchain state
  remove <name>    Remove a platform and clean up the manifest entries it owns

OPTIONS:
  --help, -h       Print this help

Run 'tsclang platform <command> --help' for command-specific options.`;

export const platformInstall = `tsclang platform install — install a platform package

USAGE:
  tsclang platform install <name>[@spec] [options]

Installs the platform package into tsc_packages/, records it in dependencies,
and appends the builds/scripts presets from its 'platform' section using the
docker-model names (official @tsclang/* unprefixed, foreign scopes prefixed
'<user>:'). Existing manifest entries are never overwritten; conflicts are
skipped with a notice (or asked on a TTY). Missing toolchains are offered for
download into ~/.tsclang/platforms/<platform>@<v>/<toolchain>@<v>.

<spec> selects a version from the catalog history: an exact version
('0.3.1'), a range ('^0.4', '~0.3.1', '>=0.4') or bare for the latest.
dependencies records the requested spec (bare writes a caret of the resolved
version, npm style); the lock pins the exact resolved version. A version
whose minCli exceeds this CLI fails loud.

OPTIONS:
  --offline        No network: loud failure (a write operation), same as
                   TSC_NO_NETWORK
  --help, -h       Print this help`;

export const platformSearch = `tsclang platform search — search the platform registry

USAGE:
  tsclang platform search [query]

Lists platform packages from the registry catalog matching the query.
Env TSC_REGISTRY points to a local catalog file or URL (tests, mirrors).

OPTIONS:
  --offline        No network: fresh cache only; without it a quiet notice
                   and an empty result (exit 0). Same as TSC_NO_NETWORK.
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

export const platformUpdate = `tsclang platform update — update installed platforms

USAGE:
  tsclang platform update [name] [options]

Compares every installed platform (or just <name>) with the registry catalog
and reapplies newer versions through the install mechanics: builds/scripts
presets the new version adds appear, presets it dropped are cleaned up, and
entries you edited are never touched (lock ownership). Toolchains of the new
version download into ~/.tsclang/platforms/<platform>@<v>/<toolchain>@<v> —
old version directories stay so pinned builds keep reproducing.

Updates stay INSIDE the spec recorded in dependencies (#280): a range moves
to the newest catalog version within it, an exact version is a pin and is
reported (never updated), and a legacy manifest without a spec follows the
catalog latest.

On a non-TTY without --yes it only prints the available updates (CI-safe, no
surprise downloads); on a TTY each update is confirmed interactively.

OPTIONS:
  --yes            Apply without interactive confirmation (pipelines)
  --offline        No network: loud failure (a write operation), same as
                   TSC_NO_NETWORK
  --help, -h       Print this help`;
