#include "runtime.h"

typedef struct { TscError _base; } MyError;
static MyError MyError_new(String msg) { MyError s = {0}; s._base.message = msg; return s; }

typedef struct { bool ok; union { int32_t value; MyError error; }; } Result_i32_MyError;
typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

Result_i32_MyError process_bool(bool flag) {
    Array_i32 items = tsc_array_create_i32(4);
    tsc_array_push_i32(&items, 1);
    if (flag) {
        tsc_array_free_i32(&items);
        return (Result_i32_MyError){.ok = false, .error = MyError_new(STR_LIT("bad"))};
    }
    int32_t _ret_0 = (int32_t)items.length;
    tsc_array_free_i32(&items);
    return (Result_i32_MyError){.ok = true, .value = _ret_0};
}

int main(void) {
    TSC_INIT();
    printf("%d\n", process_bool(false));
    return 0;
}
