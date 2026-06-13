#include "runtime.h"

typedef struct { int32_t id; } Slot;
typedef struct { bool has_value; Slot *value; int _pool_idx; } opt_ref_Slot;
typedef struct { bool ok; union { opt_ref_Slot value; TscError error; }; } Result_opt_ref_Slot_TscError;
typedef struct { bool ok; union { int32_t value; TscError error; }; } Result_i32_TscError;

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
        return (Result_opt_ref_Slot_TscError){.ok = false, .error = (TscError){ .message = STR_LIT("pool exhausted: Slot") }};
    }
    opt_ref_Slot s = _pool_0;
    s.value->id = i;
    return (Result_opt_ref_Slot_TscError){.ok = true, .value = s};
}

static void Slot_drop(opt_ref_Slot s) {
    if (s.has_value) _slot_pool_mask &= ~((uint8_t)1 << s._pool_idx);
}

Result_i32_TscError _tsc_main(void) {
    Result_opt_ref_Slot_TscError _res_1 = create_i32(1);
    if (!_res_1.ok) {
        return (Result_i32_TscError){.ok = false, .error = _res_1.error};
    }
    const opt_ref_Slot a = _res_1.value;
    Result_opt_ref_Slot_TscError _res_2 = create_i32(2);
    if (!_res_2.ok) {
        return (Result_i32_TscError){.ok = false, .error = _res_2.error};
    }
    const opt_ref_Slot b = _res_2.value;
    return (Result_i32_TscError){.ok = true, .value = a.value->id + b.value->id};
    Slot_drop(b);
    Slot_drop(a);
}

int main(void) {
    TSC_INIT();
    Result_i32_TscError _unwrap_3 = _tsc_main();
    if (!_unwrap_3.ok) { tsc_panic(_unwrap_3.error.message); }
    printf("%d\n", _unwrap_3.value);
    Result_i32_TscError _unwrap_main = _tsc_main();
    if (!_unwrap_main.ok) { tsc_panic(_unwrap_main.error.message); }
    return _unwrap_main.value;
}
