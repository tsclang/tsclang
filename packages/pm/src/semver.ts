// Minimal semver for pm + the platform catalog (#280). Understands exact,
// `^`, `~`, comparison and `*` ranges over X.Y.Z with prerelease identifiers
// ordered by semver §11 (numeric < alphanumeric, release > any prerelease).
// Build metadata is ignored. Follows npm's prerelease-matching rule: a
// prerelease version satisfies a range only when the range's comparator
// carries a prerelease of the same [major, minor, patch] triple — so `^0.4.0`
// never resolves to `0.4.1-beta`.

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  /** Prerelease dot-identifiers ('beta', 1, ...); empty = release. */
  prerelease: Array<string | number>;
}

/** Parse X.Y.Z[-pre][+build] (patch/minor default 0, build ignored); null on garbage. */
export function semverParseFull(v: string): SemVer | null {
  const core = v.split('+', 1)[0];
  const m = core.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?$/);
  if (!m) return null;
  const prerelease = m[4] === undefined
    ? []
    : m[4].split('.').map((id) => (/^\d+$/.test(id) ? parseInt(id, 10) : id));
  return {
    major: parseInt(m[1], 10),
    minor: m[2] === undefined ? 0 : parseInt(m[2], 10),
    patch: m[3] === undefined ? 0 : parseInt(m[3], 10),
    prerelease,
  };
}

function cmpPrerelease(a: Array<string | number>, b: Array<string | number>): number {
  if (!a.length && !b.length) return 0;
  if (!a.length) return 1; // release > prerelease
  if (!b.length) return -1;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i];
    const y = b[i];
    if (x === undefined) return -1; // fewer identifiers < more
    if (y === undefined) return 1;
    if (typeof x === 'number' && typeof y === 'number') {
      if (x !== y) return x < y ? -1 : 1;
    } else if (typeof x === 'string' && typeof y === 'string') {
      if (x !== y) return x < y ? -1 : 1;
    } else {
      return typeof x === 'number' ? -1 : 1; // numeric < alphanumeric
    }
  }
  return 0;
}

/** Full ordering including prerelease (semver §11). */
export function semverCmpFull(a: SemVer, b: SemVer): number {
  const core = (a.major - b.major) || (a.minor - b.minor) || (a.patch - b.patch);
  return core !== 0 ? core : cmpPrerelease(a.prerelease, b.prerelease);
}

/** Canonical text form ('1.2' → '1.2.0', keeps prerelease) — catalog keys
 * must equal it so one version can never appear under two spellings. */
export function semverCanonical(v: SemVer): string {
  const core = `${v.major}.${v.minor}.${v.patch}`;
  return v.prerelease.length ? `${core}-${v.prerelease.join('.')}` : core;
}

// ── legacy tuple API (registry.ts, config.ts) ───────────────────────────────

type Version = [number, number, number];

export function semverParse(v: string): Version {
  const full = semverParseFull(v);
  return full ? [full.major, full.minor, full.patch] : [0, 0, 0];
}

export function semverCmp([a0, a1, a2]: Version, [b0, b1, b2]: Version): number {
  return (a0 - b0) || (a1 - b1) || (a2 - b2);
}

// ── range matching ──────────────────────────────────────────────────────────

export function semverSatisfies(v: string, range: string): boolean {
  const sv = semverParseFull(v);
  if (!sv) return false;
  const body = range.trim();
  if (body === '' || body === '*' || body === 'latest') return sv.prerelease.length === 0;
  const m = body.match(/^(\^|~|>=|>|<=|<|=)?\s*(.+)$/);
  if (!m) return false;
  const op = m[1] ?? '=';
  const rv = semverParseFull(m[2].trim());
  if (!rv) return false;

  const cmp = semverCmpFull(sv, rv);

  // npm prerelease rule: a prerelease version only satisfies a range whose
  // comparator carries a prerelease of the SAME core triple.
  if (sv.prerelease.length > 0) {
    if (rv.prerelease.length === 0) return false;
    if (sv.major !== rv.major || sv.minor !== rv.minor || sv.patch !== rv.patch) return false;
    return op === '=' ? cmp === 0 : cmp >= 0;
  }

  switch (op) {
    case '=':  return cmp === 0;
    case '>=': return cmp >= 0;
    case '>':  return cmp > 0;
    case '<=': return cmp <= 0;
    case '<':  return cmp < 0;
    case '~':
    case '^': {
      if (cmp < 0) return false; // below the lower bound
      // Upper bound as a plain triple: ^1.2.3 <2.0.0, ^0.2.3 <0.3.0,
      // ^0.0.3 <0.0.4, ~1.2.3 <1.3.0.
      const upper: [number, number, number] = op === '~'
        ? [rv.major, rv.minor + 1, 0]
        : rv.major > 0 ? [rv.major + 1, 0, 0]
        : rv.minor > 0 ? [0, rv.minor + 1, 0]
        : [0, 0, rv.patch + 1];
      return sv.major < upper[0]
        || (sv.major === upper[0] && sv.minor < upper[1])
        || (sv.major === upper[0] && sv.minor === upper[1] && sv.patch < upper[2]);
    }
    default:
      return false;
  }
}

/** The highest version satisfying the range, or null when none does. */
export function semverMaxSatisfying(versions: ReadonlyArray<string>, range: string): string | null {
  let best: string | null = null;
  let bestFull: SemVer | null = null;
  for (const v of versions) {
    if (!semverSatisfies(v, range)) continue;
    const full = semverParseFull(v);
    if (!full) continue;
    if (!bestFull || semverCmpFull(full, bestFull) > 0) { best = v; bestFull = full; }
  }
  return best;
}

export function rangesCompatible(r1: string, r2: string): boolean {
  const m1 = r1.match(/^(\^|~|>=|>|<=|<)?(\d+)/);
  const m2 = r2.match(/^(\^|~|>=|>|<=|<)?(\d+)/);
  if (!m1 || !m2) return true;
  if ((m1[1] === '^' || m1[1] === '~') && (m2[1] === '^' || m2[1] === '~')) {
    if (m1[2] !== m2[2]) return false;
  }
  return true;
}
