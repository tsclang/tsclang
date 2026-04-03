#include "runtime.h"

typedef struct { bool active; } Spark;
static Spark _spark_pool[4];
static uint8_t _spark_pool_mask = 0;

typedef struct { bool has_value; Spark *value; int _pool_idx; } opt_ref_Spark;

static opt_ref_Spark Spark_alloc(void) {
    for (int _i = 0; _i < 4; _i++) {
        if (!(_spark_pool_mask & (1 << _i))) {
            _spark_pool_mask |= (1 << _i);
            return (opt_ref_Spark){true, &_spark_pool[_i], _i};
        }
    }
    return (opt_ref_Spark){false, NULL, -1};
}

static void Spark_drop(opt_ref_Spark s) {
    if (s.has_value) _spark_pool_mask &= ~(1 << s._pool_idx);
}

int main(void) {
    TSC_INIT();
    {
        opt_ref_Spark s = Spark_alloc();
        Spark_drop(s);
    }
    return 0;
}
