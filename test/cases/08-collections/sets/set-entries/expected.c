#include "runtime.h"

typedef struct { int32_t _0; int32_t _1; } Tuple_i32_i32;
typedef struct { Tuple_i32_i32 *data; size_t length; size_t capacity; } Array_Tuple_i32_i32;

int main(void) {
    TSC_INIT();
    TscSet_i32 s = tsc_set_create_i32();
    tsc_set_add_i32(&s, 10);
    tsc_set_add_i32(&s, 20);
    tsc_set_add_i32(&s, 30);
    Array_Tuple_i32_i32 _ent_0 = tsc_set_entries_i32(s);
    for (size_t _i_0 = 0; _i_0 < _ent_0.length; _i_0++) {
        const int32_t a = _ent_0.data[_i_0]._0;
        const int32_t b = _ent_0.data[_i_0]._1;
        printf("%d\n", a);
        printf("%d\n", b);
    }
    return 0;
}
