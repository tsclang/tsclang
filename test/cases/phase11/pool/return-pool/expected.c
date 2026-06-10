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

Result_opt_ref_Spark_TscError create(void) {
    opt_ref_Spark _pool_0 = Spark_alloc();
    if (!_pool_0.has_value) {
        return (Result_opt_ref_Spark_TscError){.ok = false, .error = Error_new(STR_LIT("pool exhausted: Spark"))};
    }
    opt_ref_Spark s = _pool_0;
    s.value->active = true;
    return (Result_opt_ref_Spark_TscError){.ok = true, .value = s};
}

int main(void) {
    TSC_INIT();
    Result_opt_ref_Spark_TscError _res_1 = create();
    if (_res_1.ok) {
        opt_ref_Spark x = _res_1.value;
        printf("%ld\n", (long)x.value->active);
    } else {
        (void)_res_1.error;
    }
    return 0;
}
