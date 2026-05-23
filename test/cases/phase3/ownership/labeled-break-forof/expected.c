#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

int main(void) {
    TSC_INIT();
    double _arr_data_0[] = {1, 2, 3, 4, 5};
    Array_i32 arr = (Array_f64){.data = _arr_data_0, .length = 5, .capacity = 5};
    int32_t sum = 0;
    for (int32_t i = 0; i < 3; i++) {
        String s = STR_LIT("row");
        for (size_t _i_0 = 0; _i_0 < arr.length; _i_0++) {
            const int32_t v = arr.data[_i_0];
            String t = STR_LIT("item");
            if (v == 3) {
                tsc_string_release(t);
                tsc_string_release(s);
                goto outer_break;
            }
            sum = sum + v;
            tsc_string_release(t);
        }
        sum = sum + i;
        tsc_string_release(s);
    }
    outer_break:;
    printf("%d\n", sum);
    return 0;
}
