#include "runtime.h"

typedef struct { TscError _base; } Err;
static Err Err_new(String msg) { Err s = {0}; s._base.message = msg; return s; }

typedef struct { bool ok; union { int32_t value; Err error; }; } Result_i32_Err;
typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

Result_i32_Err step_i32(int32_t n) {
    if (n <= 0) {
        return (Result_i32_Err){.ok = false, .error = Err_new(STR_LIT("bad step"))};
    }
    return (Result_i32_Err){.ok = true, .value = n * 2};
}

Result_i32_Err process_i32_i32_i32(int32_t a, int32_t b, int32_t c) {
    Result_i32_Err _result = {0};
    Array_i32 items = {0};
    items = tsc_array_create_i32(4);
    tsc_array_push_i32(&items, a);
    Result_i32_Err _res_0 = step_i32(a);
    if (!_res_0.ok) { _result = (Result_i32_Err){.ok = false, .error = _res_0.error}; goto cleanup; }
    int32_t x = _res_0.value;
    tsc_array_push_i32(&items, x);
    Result_i32_Err _res_1 = step_i32(b);
    if (!_res_1.ok) { _result = (Result_i32_Err){.ok = false, .error = _res_1.error}; goto cleanup; }
    int32_t y = _res_1.value;
    tsc_array_push_i32(&items, y);
    Result_i32_Err _res_2 = step_i32(c);
    if (!_res_2.ok) { _result = (Result_i32_Err){.ok = false, .error = _res_2.error}; goto cleanup; }
    int32_t z = _res_2.value;
    tsc_array_push_i32(&items, z);
    _result = (Result_i32_Err){.ok = true, .value = items.length};
    goto cleanup;
    cleanup:
        tsc_array_free_i32(&items);
        return _result;
}

int main(void) {
    TSC_INIT();
    Result_i32_Err _unwrap_3 = process_i32_i32_i32(1, 2, 3);
    if (!_unwrap_3.ok) { tsc_panic(_unwrap_3.error._base.message); }
    printf("%d\n", _unwrap_3.value);
    return 0;
}
