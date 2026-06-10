#include "runtime.h"

typedef struct { int32_t x; } Particle;
typedef struct { bool has_value; Particle *value; int _pool_idx; } opt_ref_Particle;

static Particle _particle_pool[4];
static uint8_t _particle_pool_mask = 0;

static opt_ref_Particle Particle_alloc(void) {
    for (int _i = 0; _i < 4; _i++) {
        if (!(_particle_pool_mask & ((uint8_t)1 << _i))) {
            _particle_pool_mask |= ((uint8_t)1 << _i);
            return (opt_ref_Particle){true, &_particle_pool[_i], _i};
        }
    }
    return (opt_ref_Particle){false, NULL, -1};
}

Result_opt_ref_Particle_TscError make(void) {
    opt_ref_Particle _pool_0 = Particle_alloc();
    if (!_pool_0.has_value) {
        return (Result_opt_ref_Particle_TscError){.ok = false, .error = Error_new(STR_LIT("pool exhausted: Particle"))};
    }
    opt_ref_Particle p = _pool_0;
    p.value->x = 10;
    return (Result_opt_ref_Particle_TscError){.ok = true, .value = p};
}

int main(void) {
    TSC_INIT();
    Result_opt_ref_Particle_TscError _res_1 = make();
    if (_res_1.ok) {
        opt_ref_Particle r = _res_1.value;
        printf("%ld\n", (long)r.value->x);
    } else {
        (void)_res_1.error;
        printf("full\n");
    }
    return 0;
}
