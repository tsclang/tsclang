#include "runtime.h"

typedef struct { bool active; } Spark;
typedef struct { bool has_value; Spark *value; int _pool_idx; } opt_ref_Spark;

static Spark _spark_pool[4];
static uint8_t _spark_pool_mask = 0;

static opt_ref_Spark Spark_alloc(void) {
    for (int _i = 0; _i < 4; _i++) {
        if (!(_spark_pool_mask & (1 << _i))) {
            _spark_pool_mask |= (1 << _i);
            return (opt_ref_Spark){true, &_spark_pool[_i], _i};
        }
    }
    return (opt_ref_Spark){false, NULL, -1};
}

opt_ref_Spark create(void) {
    opt_ref_Spark s = Spark_alloc();
    if (s.has_value) {
        s.value->active = true;
    }
    return s;
}

int main(void) {
    TSC_INIT();
    opt_ref_Spark x = create();
    if (x.has_value) {
        printf("%ld\n", (long)x.value->active);
    }
    return 0;
}
