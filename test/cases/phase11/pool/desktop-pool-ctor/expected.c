#include "runtime.h"

typedef struct { int32_t value; } Gem;
typedef struct { bool has_value; Gem *value; int _pool_idx; } opt_ref_Gem;

static Gem Gem_new(int32_t v) {
    Gem self = {0};
    self.value = v;
    return self;
}

static Gem _gem_pool[4];
static uint8_t _gem_pool_mask = 0;

static opt_ref_Gem Gem_alloc(void) {
    for (int _i = 0; _i < 4; _i++) {
        if (!(_gem_pool_mask & (1 << _i))) {
            _gem_pool_mask |= (1 << _i);
            return (opt_ref_Gem){true, &_gem_pool[_i], _i};
        }
    }
    return (opt_ref_Gem){false, NULL, -1};
}

static void Gem_drop(opt_ref_Gem g) {
    if (g.has_value) _gem_pool_mask &= ~(1 << g._pool_idx);
}

Result_i32_TscError _tsc_main(void) {
    opt_ref_Gem _pool_0 = Gem_alloc();
    if (!_pool_0.has_value) {
        return (Result_i32_TscError){.ok = false, .error = Error_new(STR_LIT("pool exhausted: Gem"))};
    }
    *_pool_0.value = Gem_new(42);
    opt_ref_Gem g = _pool_0;
    return (Result_i32_TscError){.ok = true, .value = g.value->value};
    Gem_drop(g);
}

int main(void) {
    TSC_INIT();
    Result_i32_TscError _unwrap_1 = _tsc_main();
    if (!_unwrap_1.ok) { tsc_panic(_unwrap_1.error._base.message); }
    printf("%d\n", _unwrap_1.value);
    return _tsc_main();
}
