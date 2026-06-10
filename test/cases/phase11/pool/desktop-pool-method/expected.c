#include "runtime.h"

typedef struct { int32_t count; } Counter;
typedef struct { bool has_value; Counter *value; int _pool_idx; } opt_ref_Counter;

static Counter Counter_new(void) {
    Counter self = {0};
    self.count = 0;
    return self;
}

static void Counter_increment(Counter *self) {
    self->count = self->count + 1;
}

static int32_t Counter_get(const Counter *self) {
    return self->count;
}

static Counter _counter_pool[4];
static uint8_t _counter_pool_mask = 0;

static opt_ref_Counter Counter_alloc(void) {
    for (int _i = 0; _i < 4; _i++) {
        if (!(_counter_pool_mask & (1 << _i))) {
            _counter_pool_mask |= (1 << _i);
            return (opt_ref_Counter){true, &_counter_pool[_i], _i};
        }
    }
    return (opt_ref_Counter){false, NULL, -1};
}

static void Counter_drop(opt_ref_Counter c) {
    if (c.has_value) _counter_pool_mask &= ~(1 << c._pool_idx);
}

Result_i32_TscError _tsc_main(void) {
    opt_ref_Counter _pool_0 = Counter_alloc();
    if (!_pool_0.has_value) {
        return (Result_i32_TscError){.ok = false, .error = Error_new(STR_LIT("pool exhausted: Counter"))};
    }
    opt_ref_Counter c = _pool_0;
    Counter_increment(c.value);
    Counter_increment(c.value);
    return (Result_i32_TscError){.ok = true, .value = Counter_get(c.value)};
    Counter_drop(c);
}

int main(void) {
    TSC_INIT();
    Result_i32_TscError _unwrap_1 = _tsc_main();
    if (!_unwrap_1.ok) { tsc_panic(_unwrap_1.error._base.message); }
    printf("%d\n", _unwrap_1.value);
    return _tsc_main();
}
