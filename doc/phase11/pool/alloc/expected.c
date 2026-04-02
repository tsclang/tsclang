#include "runtime.h"

typedef struct { int32_t x; } Particle;

static Particle _particle_pool[4];
static uint8_t _particle_pool_mask = 0;

typedef struct { bool has_value; Particle *value; } opt_ref_Particle;

static opt_ref_Particle Particle_alloc(void) {
    for (int _i = 0; _i < 4; _i++) {
        if (!(_particle_pool_mask & (1 << _i))) {
            _particle_pool_mask |= (1 << _i);
            return (opt_ref_Particle){true, &_particle_pool[_i]};
        }
    }
    return (opt_ref_Particle){false, NULL};
}

int main(void) {
    TSC_INIT();
    opt_ref_Particle p = Particle_alloc();
    if (p.has_value) {
        p.value->x = 10;
    }
    return 0;
}
