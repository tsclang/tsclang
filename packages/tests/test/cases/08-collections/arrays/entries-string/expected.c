#include "runtime.h"

typedef struct { int32_t _0; String _1; } Tuple_i32_string;
typedef struct { Tuple_i32_string *data; size_t length; size_t capacity; } Array_Tuple_i32_string;

int main(void) {
    TSC_INIT();
    String _lit_0[] = {STR_LIT("foo"), STR_LIT("bar"), STR_LIT("baz")};
    const Array_string a = {.data = _lit_0, .length = 3, .capacity = 3};
    Array_Tuple_i32_string _ent_1 = tsc_array_entries_string(a);
    for (size_t _i_0 = 0; _i_0 < _ent_1.length; _i_0++) {
        const int32_t i = (int32_t)_i_0;
        const String v = _ent_1.data[_i_0]._1;
        printf("%d\n", i);
        printf("%s\n", v.data);
    }
    return 0;
}
