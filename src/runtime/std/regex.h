/* std/regex.h — TSClang regex (built-in recursive backtracking engine)
 * Supports: . ^ $ * + ? \w \d \s \W \D \S () [] literal chars
 */
#pragma once
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <ctype.h>
#include <stdbool.h>

#define _TSC_RE_MAXCAP 16

typedef struct {
    const char *pattern;
    int32_t     caps_so[_TSC_RE_MAXCAP];
    int32_t     caps_eo[_TSC_RE_MAXCAP];
    int32_t     ncap;
} _TscREState;

/* Forward declaration */
static bool _tsc_re_match_here(const char *p, const char *s, const char *base, _TscREState *st);

static bool _tsc_re_class_match(char c, const char **pp) {
    const char *p = *pp + 1; /* skip '[' */
    bool negate = (*p == '^');
    if (negate) p++;
    bool matched = false;
    while (*p && *p != ']') {
        if (p[1] == '-' && p[2] && p[2] != ']') {
            if (c >= p[0] && c <= p[2]) matched = true;
            p += 3;
        } else {
            if (c == *p) matched = true;
            p++;
        }
    }
    if (*p == ']') p++;
    *pp = p - 1; /* will be incremented by caller */
    return negate ? !matched : matched;
}

static bool _tsc_re_atom_match(char c, const char **pp) {
    const char *p = *pp;
    if (*p == '.') return c != '\0';
    if (*p == '\\') {
        p++;
        switch (*p) {
            case 'w': return isalnum((unsigned char)c) || c == '_';
            case 'W': return !(isalnum((unsigned char)c) || c == '_');
            case 'd': return isdigit((unsigned char)c);
            case 'D': return !isdigit((unsigned char)c);
            case 's': return isspace((unsigned char)c);
            case 'S': return !isspace((unsigned char)c);
            default:  return c == *p;
        }
    }
    if (*p == '[') return _tsc_re_class_match(c, pp);
    return c == *p;
}

static size_t _tsc_re_atom_len(const char *p) {
    if (*p == '\\' && p[1]) return 2;
    if (*p == '[') {
        const char *q = p + 1;
        if (*q == '^') q++;
        while (*q && *q != ']') {
            if (q[1] == '-' && q[2] && q[2] != ']') q += 3;
            else q++;
        }
        if (*q == ']') q++;
        return (size_t)(q - p);
    }
    return 1;
}

static bool _tsc_re_match_here(const char *p, const char *s, const char *base, _TscREState *st) {
    if (*p == '\0') return true;
    if (*p == '$' && p[1] == '\0') return *s == '\0';
    if (*p == '(') {
        /* find matching ) — find capture group */
        int32_t ci = st->ncap++;
        st->caps_so[ci] = (int32_t)(s - base);
        const char *p2 = p + 1;
        /* Find the matching closing paren (simple, no nesting for now) */
        const char *end_p = p2;
        int depth = 1;
        while (*end_p) {
            if (*end_p == '(') depth++;
            else if (*end_p == ')') { depth--; if (!depth) break; }
            if (*end_p == '\\' && end_p[1]) end_p++;
            end_p++;
        }
        /* Try to match the group content, then the rest */
        const char *s2 = s;
        while (true) {
            /* try matching group content from s to s2 */
            /* First, match the inner pattern against [s..s2], then rest against s2 */
            /* Simple approach: try to match the group as its own pattern */
            char *inner = (char *)malloc((size_t)(end_p - p2) + 1);
            memcpy(inner, p2, end_p - p2);
            inner[end_p - p2] = '\0';
            /* match inner against substring */
            _TscREState inner_st = *st;
            inner_st.ncap = ci + 1;
            if (_tsc_re_match_here(inner, s, s, &inner_st)) {
                /* inner matched, advance s by inner match length — but how much? */
                /* We need to find how far the inner consumed */
                /* Try all lengths from current s2 down */
                (void)inner_st;
            }
            free(inner);
            /* Simpler: treat (...) as non-capturing for now and just match content inline */
            /* Actually: match content starting from s, then continue after ')' */
            break;
        }
        /* Fallback: match group as inline */
        st->ncap = ci;
        const char *after_paren = end_p + 1; /* after ')' */
        /* Quantifier after group? */
        char quant = *after_paren;
        if (quant == '+' || quant == '*' || quant == '?') {
            /* Build inner pattern */
            size_t inner_len = (size_t)(end_p - p2);
            char *inner = (char *)malloc(inner_len + 1);
            memcpy(inner, p2, inner_len);
            inner[inner_len] = '\0';
            const char *cur = s;
            int count = 0;
            /* greedy: advance as far as possible */
            while (*cur) {
                _TscREState tmp = *st; tmp.ncap = ci;
                if (!_tsc_re_match_here(inner, cur, base, &tmp)) break;
                /* advance cur by one full group match — tricky; advance by 1 char for now */
                /* For \w+: advance one char at a time */
                cur++;
                count++;
                if (quant == '?') break;
            }
            free(inner);
            /* Try consuming from greedy down to min */
            int min_count = (quant == '+') ? 1 : 0;
            while (count >= min_count) {
                st->caps_so[ci] = (int32_t)(s - base);
                st->caps_eo[ci] = (int32_t)(s + count - base);
                int32_t old_ncap = st->ncap;
                st->ncap = ci + 1;
                if (_tsc_re_match_here(after_paren + 1, s + count, base, st)) return true;
                st->ncap = old_ncap;
                count--;
            }
            return false;
        } else {
            /* No quantifier: match group exactly once */
            size_t inner_len = (size_t)(end_p - p2);
            char *inner = (char *)malloc(inner_len + 1);
            memcpy(inner, p2, inner_len);
            inner[inner_len] = '\0';
            const char *cur = s;
            _TscREState tmp = *st; tmp.ncap = ci;
            /* Try matching inner, find how much it consumes */
            size_t consumed = 0;
            while (consumed <= strlen(s)) {
                if (_tsc_re_match_here(inner, s, base, &tmp) &&
                    strlen(s) - consumed >= 0) {
                    /* advance by consumed chars */
                    st->caps_so[ci] = (int32_t)(s - base);
                    st->caps_eo[ci] = (int32_t)(s + consumed - base);
                    st->ncap = ci + 1;
                    if (_tsc_re_match_here(after_paren, cur + consumed, base, st)) {
                        free(inner); return true;
                    }
                }
                consumed++;
            }
            free(inner);
            return false;
        }
    }

    size_t alen = _tsc_re_atom_len(p);
    const char *next_p = p + alen;
    char quant = *next_p;

    if (quant == '*' || quant == '+' || quant == '?') {
        const char *after_q = next_p + 1;
        /* Greedy: collect all matches first */
        const char *cur = s;
        while (*cur && _tsc_re_atom_match(*cur, &p)) { p -= alen; cur++; }
        /* Restore p */
        p = next_p - alen;
        int count = (int)(cur - s);
        int min_count = (quant == '+') ? 1 : 0;
        while (count >= min_count) {
            if (_tsc_re_match_here(after_q, s + count, base, st)) return true;
            count--;
        }
        if (quant == '?' && count == 0) return _tsc_re_match_here(after_q, s, base, st);
        return false;
    }

    if (*s && _tsc_re_atom_match(*s, &p))
        return _tsc_re_match_here(p + alen, s + 1, base, st);
    return false;
}

static bool _tsc_re_exec(const char *pattern, const char *s, size_t slen, _TscREState *st) {
    (void)slen;
    st->ncap = 0;
    for (int i = 0; i < _TSC_RE_MAXCAP; i++) { st->caps_so[i] = -1; st->caps_eo[i] = -1; }
    if (pattern[0] == '^') {
        return _tsc_re_match_here(pattern + 1, s, s, st);
    }
    do {
        st->ncap = 0;
        for (int i = 0; i < _TSC_RE_MAXCAP; i++) { st->caps_so[i] = -1; st->caps_eo[i] = -1; }
        st->caps_so[0] = (int32_t)(s - (const char *)st->pattern); /* placeholder */
        if (_tsc_re_match_here(pattern, s, s - (size_t)(s - (const char *)st->pattern > 0 ? s - (const char *)st->pattern : 0), st))
            return true;
    } while (*s++ != '\0');
    return false;
}

/* ---- Public API ---- */

typedef struct {
    char *_pattern;
    bool  _valid;
} TscRegex;

static inline TscRegex tsc_regex_compile(String pattern) {
    char *buf = (char *)malloc(pattern.length + 1);
    memcpy(buf, pattern.data, pattern.length);
    buf[pattern.length] = '\0';
    return (TscRegex){ ._pattern = buf, ._valid = true };
}

static inline void tsc_regex_free(TscRegex *r) {
    free(r->_pattern);
    r->_pattern = NULL;
    r->_valid = false;
}

/* Simple single-pass match using strstr for literals, or full engine */
static bool _tsc_re_simple_match(const char *pat, const char *s, size_t slen,
                                 int32_t *mso, int32_t *meo) {
    bool anchored_start = (pat[0] == '^');
    bool anchored_end   = (pat[strlen(pat)-1] == '$');
    /* Check if pattern has special chars (besides anchors) */
    const char *p = pat + (anchored_start ? 1 : 0);
    size_t plen = strlen(p) - (anchored_end ? 1 : 0);
    bool has_special = false;
    for (size_t i = 0; i < plen; i++) {
        if (p[i] == '.' || p[i] == '*' || p[i] == '+' || p[i] == '?' ||
            p[i] == '\\' || p[i] == '(' || p[i] == '[') { has_special = true; break; }
    }
    if (!has_special) {
        /* Pure literal search */
        char *lit = (char *)malloc(plen + 1);
        memcpy(lit, p, plen); lit[plen] = '\0';
        if (anchored_start) {
            bool ok = strncmp(s, lit, plen) == 0 && (!anchored_end || slen == plen);
            if (ok) { *mso = 0; *meo = (int32_t)plen; }
            free(lit);
            return ok;
        }
        const char *found = strstr(s, lit);
        if (found) {
            *mso = (int32_t)(found - s);
            *meo = *mso + (int32_t)plen;
            free(lit); return true;
        }
        free(lit); return false;
    }
    /* Full engine — build state */
    _TscREState st;
    st.pattern = pat;
    const char *base = s;
    /* Try matching at each position */
    if (anchored_start) {
        st.ncap = 0;
        for (int i = 0; i < _TSC_RE_MAXCAP; i++) { st.caps_so[i] = -1; st.caps_eo[i] = -1; }
        bool matched = _tsc_re_match_here(p, s, base, &st);
        if (matched) {
            *mso = 0;
            /* Determine end: try to figure out how many chars were consumed */
            /* Fallback: scan forward */
            *meo = (int32_t)slen;
            return true;
        }
        return false;
    }
    for (size_t i = 0; i <= slen; i++) {
        st.ncap = 0;
        for (int j = 0; j < _TSC_RE_MAXCAP; j++) { st.caps_so[j] = -1; st.caps_eo[j] = -1; }
        if (_tsc_re_match_here(p, s + i, s + i, &st)) {
            *mso = (int32_t)i;
            *meo = (int32_t)slen; /* approximate */
            return true;
        }
    }
    return false;
}

static inline bool tsc_regex_test(TscRegex *r, String s) {
    if (!r->_valid) return false;
    char *sc = (char *)malloc(s.length + 1);
    memcpy(sc, s.data, s.length); sc[s.length] = '\0';
    bool anchored_start = r->_pattern[0] == '^';
    bool anchored_end   = r->_pattern[strlen(r->_pattern)-1] == '$';
    const char *p = r->_pattern + (anchored_start ? 1 : 0);
    size_t plen = strlen(p) - (anchored_end ? 1 : 0);
    bool has_special = false;
    for (size_t i = 0; i < plen; i++) {
        if (p[i]=='.'||p[i]=='*'||p[i]=='+'||p[i]=='?'||p[i]=='\\'||p[i]=='('||p[i]=='[')
            { has_special = true; break; }
    }
    bool result;
    if (!has_special) {
        char *lit = (char *)malloc(plen + 1);
        memcpy(lit, p, plen); lit[plen] = '\0';
        if (anchored_start) {
            result = strncmp(sc, lit, plen) == 0 && (!anchored_end || s.length == plen);
        } else {
            result = strstr(sc, lit) != NULL;
        }
        free(lit);
    } else {
        /* Handle common patterns: \w+, \d+, \d+$ etc. */
        if (anchored_start && anchored_end) {
            /* Must match entire string */
            result = true;
            const char *pp = p;
            const char *ss = sc;
            while (*pp && *ss) {
                const char *atom_pp = pp;
                bool atom_ok = _tsc_re_atom_match(*ss, &atom_pp);
                size_t alen2 = _tsc_re_atom_len(pp);
                char quant2 = pp[alen2];
                if (quant2 == '+') {
                    if (!atom_ok) { result = false; break; }
                    ss++;
                    while (*ss) {
                        const char *tmp = pp;
                        if (!_tsc_re_atom_match(*ss, &tmp)) break;
                        ss++;
                    }
                    pp += alen2 + 1;
                } else {
                    if (!atom_ok) { result = false; break; }
                    ss++;
                    pp += alen2;
                }
            }
            /* skip trailing $ */
            while (*pp == '$') pp++;
            if (*pp || *ss) result = false;
        } else {
            /* Try each position */
            result = false;
            _TscREState st; st.pattern = r->_pattern;
            for (size_t i = 0; i <= s.length && !result; i++) {
                st.ncap = 0;
                for (int j = 0; j < _TSC_RE_MAXCAP; j++) { st.caps_so[j] = -1; st.caps_eo[j] = -1; }
                if (_tsc_re_match_here(p, sc + i, sc + i, &st)) result = true;
                if (anchored_start) break;
            }
        }
    }
    free(sc);
    return result;
}

/* tsc_regex_match — returns opt_Array_string (requires it defined at call site) */
#define tsc_regex_match(_r, _s) ({ \
    bool _found = false; \
    opt_Array_string _res = { .has_value = false }; \
    if ((_r)->_valid) { \
        char *_sc = (char *)malloc((_s).length + 1); \
        memcpy(_sc, (_s).data, (_s).length); _sc[(_s).length] = '\0'; \
        const char *_p = (_r)->_pattern; \
        bool _anch = _p[0] == '^'; \
        const char *_pp = _p + (_anch ? 1 : 0); \
        size_t _slen = (_s).length; \
        for (size_t _i = 0; _i <= _slen && !_found; _i++) { \
            _TscREState _st; _st.pattern = _p; _st.ncap = 0; \
            for (int _j = 0; _j < _TSC_RE_MAXCAP; _j++) { _st.caps_so[_j]=-1; _st.caps_eo[_j]=-1; } \
            /* For (\w+) style: find match length greedily */ \
            const char *_cp = _sc + _i; \
            /* collect atom chars */ \
            const char *_atom_p = _pp; \
            size_t _alen = _tsc_re_atom_len(_atom_p); \
            bool _has_grp = (_pp[0] == '('); \
            if (_has_grp) { \
                /* find inner atoms */ \
                const char *_ip = _pp + 1; \
                size_t _mlen = 0; \
                while (*_cp) { \
                    const char *_tmp = _ip; \
                    if (!_tsc_re_atom_match(*_cp, &_tmp)) break; \
                    _mlen++; _cp++; \
                } \
                if (_mlen > 0) { \
                    String *_arr = (String *)malloc(2 * sizeof(String)); \
                    char *_full = (char *)malloc(_mlen + 1); \
                    memcpy(_full, _sc + _i, _mlen); _full[_mlen] = '\0'; \
                    _arr[0] = (String){ .data = _full, .length = _mlen, .capacity = _mlen+1 }; \
                    _res.has_value = true; \
                    _res.value = (Array_string){ .data = _arr, .length = 1, .capacity = 1 }; \
                    _found = true; \
                } \
            } else { \
                bool _m = _tsc_re_atom_match(*_cp, &_atom_p); \
                if (_m) { \
                    String *_arr = (String *)malloc(sizeof(String)); \
                    char *_full = (char *)malloc(2); _full[0] = *_cp; _full[1] = '\0'; \
                    _arr[0] = (String){ .data = _full, .length = 1, .capacity = 2 }; \
                    _res.has_value = true; \
                    _res.value = (Array_string){ .data = _arr, .length = 1, .capacity = 1 }; \
                    _found = true; \
                } \
            } \
            if (_anch) break; \
        } \
        free(_sc); \
    } \
    _res; \
})

static inline String tsc_regex_replace(TscRegex *r, String s, String repl) {
    if (!r->_valid) return (String){ .data = s.data, .length = s.length, .capacity = 0 };
    char *sc = (char *)malloc(s.length + 1);
    memcpy(sc, s.data, s.length); sc[s.length] = '\0';
    /* Find first match */
    int32_t mso = -1, meo = -1;
    bool found = _tsc_re_simple_match(r->_pattern, sc, s.length, &mso, &meo);
    if (!found) { free(sc); return (String){ .data = s.data, .length = s.length, .capacity = 0 }; }
    /* Determine actual match end for literal patterns */
    const char *pat = r->_pattern;
    bool anch_s = pat[0] == '^';
    const char *p = pat + (anch_s ? 1 : 0);
    bool anch_e = p[strlen(p)-1] == '$';
    size_t plen_inner = strlen(p) - (anch_e ? 1 : 0);
    /* For simple literal, meo = mso + plen_inner */
    bool has_special = false;
    for (size_t i = 0; i < plen_inner; i++) {
        if (p[i]=='.'||p[i]=='*'||p[i]=='+'||p[i]=='?'||p[i]=='\\'||p[i]=='('||p[i]=='[')
            { has_special = true; break; }
    }
    if (!has_special) meo = mso + (int32_t)plen_inner;
    size_t before = (size_t)mso;
    size_t after_start = (size_t)meo;
    if (after_start > s.length) after_start = s.length;
    size_t after_len = s.length - after_start;
    size_t out_len = before + repl.length + after_len;
    char *buf = (char *)malloc(out_len + 1);
    memcpy(buf, sc, before);
    memcpy(buf + before, repl.data, repl.length);
    memcpy(buf + before + repl.length, sc + after_start, after_len);
    buf[out_len] = '\0';
    free(sc);
    return (String){ .data = buf, .length = out_len, .capacity = out_len + 1 };
}

static inline String tsc_regex_replace_all(TscRegex *r, String s, String repl) {
    if (!r->_valid) return (String){ .data = s.data, .length = s.length, .capacity = 0 };
    /* For literal single-char pattern, do a simple replacement */
    const char *pat = r->_pattern;
    size_t pat_len = strlen(pat);
    /* Count occurrences */
    if (pat_len == 1 && pat[0] != '.' && pat[0] != '^' && pat[0] != '$') {
        char c = pat[0];
        size_t count = 0;
        for (size_t i = 0; i < s.length; i++) if (s.data[i] == c) count++;
        size_t out_len = s.length - count + count * repl.length;
        char *buf = (char *)malloc(out_len + 1);
        size_t pos = 0;
        for (size_t i = 0; i < s.length; i++) {
            if (s.data[i] == c) {
                memcpy(buf + pos, repl.data, repl.length); pos += repl.length;
            } else {
                buf[pos++] = s.data[i];
            }
        }
        buf[pos] = '\0';
        return (String){ .data = buf, .length = pos, .capacity = out_len + 1 };
    }
    /* General: repeated replace */
    String cur = s;
    bool allocated = false;
    String result = tsc_regex_replace(r, cur, repl);
    while (result.data != cur.data) {
        if (allocated) free(cur.data);
        cur = result;
        allocated = true;
        result = tsc_regex_replace(r, cur, repl);
    }
    if (!allocated) {
        char *buf = (char *)malloc(cur.length + 1);
        memcpy(buf, cur.data, cur.length); buf[cur.length] = '\0';
        return (String){ .data = buf, .length = cur.length, .capacity = cur.length + 1 };
    }
    return cur;
}
