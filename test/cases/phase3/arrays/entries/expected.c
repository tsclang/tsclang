#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;
typedef struct { int32_t _0; int32_t _1; } Tuple_i32_i32;
typedef struct { Tuple_i32_i32 *data; size_t length; size_t capacity; } Array_Tuple_i32_i32;

int main(void) {
    TSC_INIT();
    int32_t _lit_0[] = {10, 20, 30};
    const Array_i32 a = {.data = _lit_0, .length = 3, .capacity = 3};
    Array_Tuple_i32_i32 _ent_1 = tsc_array_entries_i32(a);
    for (size_t _i_0 = 0; _i_0 < _ent_1.length; _i_0++) {
        const int32_t i = (int32_t)_i_0;
        const int32_t v = _ent_1.data[_i_0]._1;
        printf("%d\n", i);
        printf("%d\n", v);
    }
    return 0;
}
