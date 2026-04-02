#include "runtime.h"

typedef struct { int32_t value; } Gem;
static Gem _gem_pool[4];
static uint8_t _gem_pool_mask = 0;

typedef struct { bool has_value; Gem *value; int _pool_idx; } opt_ref_Gem;

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

int main(void) {
    TSC_INIT();
    opt_ref_Gem g = Gem_alloc();
    if (g.has_value) {
        g.value->value = 99;
        Gem_drop(g);
    }
    return 0;
}
