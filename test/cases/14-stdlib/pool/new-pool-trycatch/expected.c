#include "runtime.h"

typedef struct { int32_t value; } Gem;
typedef struct { bool has_value; Gem *value; int _pool_idx; } opt_ref_Gem;

static Gem _gem_pool[2];
static uint8_t _gem_pool_mask = 0;

static opt_ref_Gem Gem_alloc(void) {
    for (int _i = 0; _i < 2; _i++) {
        if (!(_gem_pool_mask & ((uint8_t)1 << _i))) {
            _gem_pool_mask |= ((uint8_t)1 << _i);
            return (opt_ref_Gem){true, &_gem_pool[_i], _i};
        }
    }
    return (opt_ref_Gem){false, NULL, -1};
}

int main(void) {
    TSC_INIT();
    TscError _catch_err_0 = {0};
    opt_ref_Gem _pool_1 = Gem_alloc();
    if (!_pool_1.has_value) {
        _catch_err_0 = (TscError){ .message = STR_LIT("pool exhausted: Gem") };
        goto _catch_0;
    }
    opt_ref_Gem g = _pool_1;
    g.value->value = 42;
    printf("%ld\n", (long)g.value->value);
    goto _catch_end_0;
    _catch_0:
    printf("pool full\n");
    _catch_end_0:;
    return 0;
}
