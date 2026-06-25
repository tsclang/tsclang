#include "runtime.h"

typedef struct { TscError _base; } MyError;
static MyError MyError_new(String msg) { MyError s = {0}; s._base.message = msg; return s; }

typedef struct { bool ok; union { int32_t value; MyError error; }; } Result_i32_MyError;
typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

Result_i32_MyError process_bool(bool flag) {
    Result_i32_MyError _result = {0};
    Array_i32 items = {0};
    items = tsc_array_create_i32(4);
    tsc_array_push_i32(&items, 1);
    if (flag) {
        _result = (Result_i32_MyError){.ok = false, .error = MyError_new(STR_LIT("bad"))};
        goto cleanup;
    }
    _result = (Result_i32_MyError){.ok = true, .value = (int32_t)items.length};
    goto cleanup;
    cleanup:
        tsc_array_free_i32(&items);
        return _result;
}

int main(void) {
    TSC_INIT();
    Result_i32_MyError _unwrap_0 = process_bool(false);
    if (!_unwrap_0.ok) { tsc_panic(_unwrap_0.error._base.message); }
    printf("%d\n", _unwrap_0.value);
    return 0;
}
