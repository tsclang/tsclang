# Package Manager

[← Up](./index.md) | [Next →](./embedded.md) | [Previous ←](./cli.md)

---

The TSClang package manager handles dependencies: installation, updates, package publishing. Uses a flat dependency tree (like Cargo/Go) and a lock file for reproducibility.

## tsclang install

```bash
tsclang install                     # install all dependencies
tsclang install @tsc/sqlite3        # add to dependencies
tsclang install @tsc/test -d        # add to devDependencies
tsclang install @tsc/a @tsc/b -d    # add several at once
tsclang install @tsc/sqlite3@^1.2.0 # with version specified
```

### Flags

| Flag | Short | Description |
|------|-------|-------------|
| `--production` | `-p` | Install only `dependencies`, without `devDependencies` |
| `--dev` | `-d` | Install only `devDependencies` |
| `--force` | `-f` | Ignore dependency incompatibilities |

### install vs update

| | `tsclang install` | `tsclang update` |
|---|---|---|
| Lock file exists | Uses exact versions from lock | Ignores lock, searches for new versions |
| Lock file absent | Resolves by constraints, creates lock | Same |
| Result | Reproducible installation | Updated lock file |

## tsclang update

```bash
tsclang update                          # update everything possible
tsclang update <dep>                    # update specific dependency
tsclang update @scope/sdl2              # update only sdl2
tsclang update @scope/sdl2 @scope/json  # update several
```

| Flag | Short | Description |
|------|-------|-------------|
| `--force` | `-f` | Ignore incompatibilities |

`tsclang update` automatically runs `tsclang install` after updating the lock file.

## tsclang remove

```bash
tsclang remove                      # remove all dependencies
tsclang remove @tsc/sqlite3         # remove specific one
tsclang remove @tsc/a @tsc/b        # remove several
tsclang remove @tsc/sqlite3 -f      # --force, no confirmation
```

Removal requires confirmation:

```
? Remove @tsc/sqlite3 from dependencies? (Y/n)
```

`--force` / `-f` flag skips confirmation.

## tsclang publish

Publish a package to the centralized registry `registry.tsclang.org`.

```bash
tsclang publish
```

### What is checked when publishing a C-wrapper

1. `name` in `@scope/package` format
2. `version` in semver format
3. `index.d.tsc` exists
4. All `declare opaque type` have `destructor`
5. All `declare function` use correct types

### What is published

```
@tsc/sqlite3@1.0.0/
  tsc.package.json
  index.d.tsc
```

Only two files — no C code. The `files` field limits the file list; `devDependencies` are excluded automatically.

### Publishing a platform profile

```bash
tsclang publish
```

```
@nes/platform@1.0.0/
  tsc.package.json
  index.d.tsc
  toolchain.cmake
```

## tsclang search

```bash
tsclang search sqlite        # find packages by keyword
tsclang search @tsc/         # show all packages in scope
```

## Flat dependency tree

TSClang uses a single flat list of dependencies — one version per project, without nested `node_modules`:

```
❌ node_modules style (nested):
  myapp/node_modules/@myco/a/node_modules/@myco/utils@1.0.0
  myapp/node_modules/@myco/b/node_modules/@myco/utils@2.0.0

✅ Flat style (one version):
  @myco/utils@2.1.0   ← maximum version satisfying all constraints
```

**Resolution algorithm:**
1. Collect all constraints on a package from the entire tree
2. Find the maximum version satisfying all
3. If impossible — error:

```
error: version conflict for @myco/utils
  @myco/db@1.0.0 requires @myco/utils ^2.0.0
  @myco/http@1.0.0 requires @myco/utils ^1.0.0
  hint: add "overrides" to tsc.package.json to force a version
```

## Versioning

**Semver strings:** `^1.0.0`, `~1.2.0`, `>=1.0.0`, `1.0.0`

### Dependency resolution

1. **System** — `pkg-config` checks presence and version
2. **Registry** (`registry.tsclang.org`) — downloads required version

```
error: @scope/sdl2 >=2.28.0 not found
hint: install it manually:
  apt install libsdl2-dev
  brew install sdl2
```

Version from `pkg-config` is written to the lock file. On mismatch — error:

```
error: lock file requires sdl2 2.28.5, system has 2.26.0
hint: run `tsclang update` to re-resolve
```

## Lock file

`tsc.package.lock` fixes exact versions and hashes:

```json
{
  "packages": {
    "@tsc/sqlite3": {
      "version": "1.0.0",
      "resolved": "https://registry.tsclang.org/@tsc/sqlite3/1.0.0.tgz",
      "integrity": "sha256:abc123..."
    },
    "@myco/utils": {
      "version": "2.1.0",
      "resolved": "https://registry.tsclang.org/@myco/utils/2.1.0.tgz",
      "integrity": "sha256:def456..."
    }
  }
}
```

Lock file is committed to the repository for reproducibility.

## Cache

Global cache `~/.tsclang/cache/` — deduplication across projects:

```
~/.tsclang/cache/
  @tsc/sqlite3@1.0.0/
    source/
      index.d.tsc
      tsc.package.json
    build/
      desktop/
        include/  sqlite3.h
        lib/      libsqlite3.a
      avr-atmega328p/
        include/
        lib/
```

One library version — separate builds for each target.

### Cache invalidation

| Condition | Action |
|-----------|--------|
| Source changed | Recompile |
| Compiler `tscVersion` changed | Recompile everything |
| `target` / `mcu` changed | Recompile for new target |
| `cflags` changed | Recompile |

## Workspaces (monorepo)

Multiple packages in one repository:

```json
{
  "workspaces": [
    "packages/*"
  ]
}
```

```
my-monorepo/
  tsc.package.json          ← root: { "workspaces": ["packages/*"] }
  packages/
    core/
      tsc.package.json      ← { "name": "@myco/core" }
    cli/
      tsc.package.json      ← { "name": "@myco/cli", "dependencies": { "@myco/core": "^1.0.0" } }
```

`tsclang install` in the root installs dependencies for all packages and links local workspace packages via symlink.

## declare library

A library can declare platform requirements — the compiler checks compatibility at build time.

```typescript
// @myco/async/index.d.tsc
declare library {
    name: "@myco/async"
    version: "1.0.0"

    requires: ["heap", "threads"]
    minHeap: 65536
    minBits: 32

    stdModules: ["std/threads", "std/sync"]
}
```

### declare library fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Package name |
| `version` | string | Version |
| `requires` | string[] | `"heap"`, `"threads"`, `"filesystem"`, `"fpu"` |
| `minHeap` | number | Minimum heap in bytes |
| `minBits` | number | Minimum bit width (8, 16, 32, 64) |
| `minStack` | number | Minimum stack in bytes |
| `stdModules` | string[] | Required std modules |
| `staticOnly` | boolean | Fallback for no-heap platforms |

### Compatibility check

```
error: @myco/async requires "heap" but platform has heap: false
  library: @myco/async/index.d.tsc
  platform: @avr/platform
  hint: use @myco/async/static or choose different library
```

```
error: @tsc/sqlite3 requires minHeap 65536 but platform has 4096
  library: @tsc/sqlite3
  platform: @arm/platform (Cortex-M0)
  hint: increase heap size or use lighter alternative
```

## C-output

C-wrapper dependencies generate linking instructions in CMakeLists.txt:

```cmake
# from @tsc/sqlite3
find_package(PkgConfig REQUIRED)
pkg_check_modules(SQLITE3 REQUIRED sqlite3)
target_link_libraries(myapp PRIVATE ${SQLITE3_LIBRARIES})
```

## Errors

| Error | Cause |
|-------|-------|
| `dependency conflict` | Incompatible semver constraints |
| `version conflict for @myco/utils` | Two packages require incompatible versions |
| `lock file requires sdl2 2.28.5, system has 2.26.0` | System version does not match lock |
| `@tsc/sqlite3 not found` | Package not found in registry and system |
| `@myco/async requires "heap" but platform has heap: false` | Library incompatible with platform |

## See also

- [Configuration](./config.md) — dependencies, devDependencies, overrides
- [Project types](./projects.md) — C-wrapper, platform profile
- [CLI](./cli.md) — install, update, remove commands
- [Modules: .d.tsc](../08-modules/d-tsc.md) — declare library, declare link
