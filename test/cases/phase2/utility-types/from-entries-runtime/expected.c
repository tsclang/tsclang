#include "runtime.h"

typedef struct { int32_t a; int32_t b; } _fromEntries_0;
typedef struct { String _0; int32_t _1; } tuple_string_i32;
typedef struct { tuple_string_i32 *data; size_t length; size_t capacity; } Array_tuple;

int main(void) {
    TSC_INIT();
    _fromEntries_0 obj = {0};
    obj = (_fromEntries_0){.a = 1, .b = 2};
    printf("%d\n", obj.a);
    return 0;
}
