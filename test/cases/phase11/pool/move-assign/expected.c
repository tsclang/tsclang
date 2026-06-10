#include "runtime.h"

typedef struct { bool active; } Spark;
typedef struct { bool has_value; Spark *value; int _pool_idx; } opt_ref_Spark;

static Spark _spark_pool[4];
static uint8_t _spark_pool_mask = 0;

static opt_ref_Spark Spark_alloc(void) {
    for (int _i = 0; _i < 4; _i++) {
        if (!(_spark_pool_mask & ((uint8_t)1 << _i))) {
            _spark_pool_mask |= ((uint8_t)1 << _i);
            return (opt_ref_Spark){true, &_spark_pool[_i], _i};
        }
    }
    return (opt_ref_Spark){false, NULL, -1};
}

static void Spark_drop(opt_ref_Spark s) {
    if (s.has_value) _spark_pool_mask &= ~((uint8_t)1 << s._pool_idx);
}

Result_void_TscError test(void) {
    opt_ref_Spark _pool_0 = Spark_alloc();
    if (!_pool_0.has_value) {
        return (Result_void_TscError){.ok = false, .error = Error_new(STR_LIT("pool exhausted: Spark"))};
    }
    opt_ref_Spark a = _pool_0;
    a.value->active = true;
    opt_ref_Spark b = a;
    a = (opt_ref_Spark){0};
    if (b.has_value) {
        printf("%ld\n", (long)b.value->active);
    }
    Spark_drop(b);
    return (Result_void_TscError){.ok = true};
}

int main(void) {
    TSC_INIT();
    return 0;
}
