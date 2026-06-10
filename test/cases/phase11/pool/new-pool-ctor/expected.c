#include "runtime.h"

typedef struct { int32_t id; int32_t temp; } Sensor;
typedef struct { bool has_value; Sensor *value; int _pool_idx; } opt_ref_Sensor;

static Sensor Sensor_new(int32_t id, int32_t temp) {
    Sensor self = {0};
    self.id = id;
    self.temp = temp;
    return self;
}

static Sensor _sensor_pool[4];
static uint8_t _sensor_pool_mask = 0;

static opt_ref_Sensor Sensor_alloc(void) {
    for (int _i = 0; _i < 4; _i++) {
        if (!(_sensor_pool_mask & ((uint8_t)1 << _i))) {
            _sensor_pool_mask |= ((uint8_t)1 << _i);
            return (opt_ref_Sensor){true, &_sensor_pool[_i], _i};
        }
    }
    return (opt_ref_Sensor){false, NULL, -1};
}

Result_opt_ref_Sensor_TscError makeSensor_i32_i32(int32_t id, int32_t t) {
    opt_ref_Sensor _pool_0 = Sensor_alloc();
    if (!_pool_0.has_value) {
        return (Result_opt_ref_Sensor_TscError){.ok = false, .error = Error_new(STR_LIT("pool exhausted: Sensor"))};
    }
    *_pool_0.value = Sensor_new(id, t);
    opt_ref_Sensor s = _pool_0;
    return (Result_opt_ref_Sensor_TscError){.ok = true, .value = s};
}

int main(void) {
    TSC_INIT();
    Result_opt_ref_Sensor_TscError _res_1 = makeSensor_i32_i32(1, 36);
    if (_res_1.ok) {
        opt_ref_Sensor x = _res_1.value;
        printf("%ld\n", (long)x.value->id);
        printf("%ld\n", (long)x.value->temp);
    } else {
        (void)_res_1.error;
    }
    return 0;
}
