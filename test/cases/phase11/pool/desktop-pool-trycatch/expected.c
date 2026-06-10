#include "runtime.h"

typedef struct { int32_t id; } Slot;
typedef struct { bool has_value; Slot *value; int _pool_idx; } opt_ref_Slot;

static Slot _slot_pool[2];
static uint8_t _slot_pool_mask = 0;

static opt_ref_Slot Slot_alloc(void) {
    for (int _i = 0; _i < 2; _i++) {
        if (!(_slot_pool_mask & ((uint8_t)1 << _i))) {
            _slot_pool_mask |= ((uint8_t)1 << _i);
            return (opt_ref_Slot){true, &_slot_pool[_i], _i};
        }
    }
    return (opt_ref_Slot){false, NULL, -1};
}

static void Slot_drop(opt_ref_Slot s) {
    if (s.has_value) _slot_pool_mask &= ~((uint8_t)1 << s._pool_idx);
}

int32_t _tsc_main(void) {
    int32_t count = 0;
    for (int32_t i = 0; i < 5; i = i + 1) {
        Error _catch_err_0 = {0};
    opt_ref_Slot _pool_1 = Slot_alloc();
    if (!_pool_1.has_value) {
        _catch_err_0 = Error_new(STR_LIT("pool exhausted: Slot"));
        goto _catch_0;
    }
        opt_ref_Slot s = _pool_1;
        s.value->id = i;
        count = count + s.value->id;
        goto _catch_end_0;
        _catch_0:
        count = count + 100;
        _catch_end_0:;
        Slot_drop(s);
    }
    return count;
}

int main(void) {
    TSC_INIT();
    printf("%d\n", _tsc_main());
    return _tsc_main();
}
