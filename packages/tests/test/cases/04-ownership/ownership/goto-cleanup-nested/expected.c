#include "runtime.h"

typedef struct { TscError _base; } Err;
static Err Err_new(String msg) { Err s = {0}; s._base.message = msg; return s; }

typedef struct { bool ok; union { int32_t value; Err error; }; } Result_i32_Err;
typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

Result_i32_Err process_i32(int32_t x) {
    Result_i32_Err _result = {0};
    Array_i32 items = {0};
    items = tsc_array_create_i32(4);
    {
        Array_i32 inner = tsc_array_create_i32(2);
        if (x < 0) {
            tsc_array_free_i32(&inner);
            _result = (Result_i32_Err){.ok = false, .error = Err_new(STR_LIT("fail"))};
            goto cleanup;
        }
        inner.data[0] = x;
        tsc_array_push_i32(&items, inner.data[0]);
        tsc_array_free_i32(&inner);
    }
    _result = (Result_i32_Err){.ok = true, .value = items.length};
    goto cleanup;
    cleanup:
        tsc_array_free_i32(&items);
        return _result;
}

int main(void) {
    TSC_INIT();
    Result_i32_Err _unwrap_0 = process_i32(1);
    if (!_unwrap_0.ok) { tsc_panic(_unwrap_0.error._base.message); }
    printf("%d\n", _unwrap_0.value);
    return 0;
}
