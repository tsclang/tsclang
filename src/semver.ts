type Version = [number, number, number];

export function semverParse(v: string): Version {
  const [maj, min, pat] = v.split('.').map(Number);
  return [maj || 0, min || 0, pat || 0];
}

export function semverCmp([a0, a1, a2]: Version, [b0, b1, b2]: Version): number {
  return (a0 - b0) || (a1 - b1) || (a2 - b2);
}

export function semverSatisfies(v: string, range: string): boolean {
  const sv = semverParse(v);
  const m = range.match(/^(\^|~|>=|>|<=|<|=)?(.+)$/);
  if (!m) return false;
  const [, op, ver] = m;
  const sv2 = semverParse(ver);
  const cmp = semverCmp(sv, sv2);
  switch (op || '=') {
    case '^':  return cmp >= 0 && sv[0] === sv2[0] && (sv2[0] !== 0 || (sv[1] === sv2[1] && cmp >= 0));
    case '~':  return cmp >= 0 && sv[0] === sv2[0] && sv[1] === sv2[1];
    case '>=': return cmp >= 0;
    case '>':  return cmp > 0;
    case '<=': return cmp <= 0;
    case '<':  return cmp < 0;
    default:   return cmp === 0;
  }
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
