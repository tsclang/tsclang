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

Result_opt_ref_Slot_TscError create_i32(int32_t i) {
    opt_ref_Slot _pool_0 = Slot_alloc();
    if (!_pool_0.has_value) {
        return (Result_opt_ref_Slot_TscError){.ok = false, .error = Error_new(STR_LIT("pool exhausted: Slot"))};
    }
    opt_ref_Slot s = _pool_0;
    s.value->id = i;
    return (Result_opt_ref_Slot_TscError){.ok = true, .value = s};
}

Result_i32_TscError _tsc_main(void) {
    Result_opt_ref_Slot_TscError a = create_i32(1);
    const Result_opt_ref_Slot_TscError b = create_i32(2);
    return (Result_i32_TscError){.ok = true, .value = a.id + b.id};
}

int main(void) {
    TSC_INIT();
    Result_i32_TscError _unwrap_1 = _tsc_main();
    if (!_unwrap_1.ok) { tsc_panic(_unwrap_1.error._base.message); }
    printf("%d\n", _unwrap_1.value);
    return _tsc_main();
}
