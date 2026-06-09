#include "runtime.h"

typedef struct { int32_t value; } Gem;
typedef struct { bool has_value; Gem *value; int _pool_idx; } opt_ref_Gem;

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

Result_void_TscError test(void) {
    opt_ref_Gem _pool_0 = Gem_alloc();
    if (!_pool_0.has_value) {
        return (Result_void_TscError){.ok = false, .error = Error_new(STR_LIT("pool exhausted: Gem"))};
    }
    opt_ref_Gem g = _pool_0;
    g.value->value = 99;
    Gem_drop(g);
    Gem_drop(g);
    return (Result_void_TscError){.ok = true};
}

int main(void) {
    TSC_INIT();
    return 0;
}
