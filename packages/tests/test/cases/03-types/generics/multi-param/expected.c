#include "runtime.h"

String makePair_i32_f64(int32_t a, double b) {
    return tsc_string_format("%d,%s", a, tsc_dtoa(b));
}

String makePair_string_i32(String a, int32_t b) {
    return tsc_string_format("%.*s,%d", (int)a.length, a.data, b);
}

int main(void) {
    TSC_INIT();
    printf("%s\n", makePair_i32_f64(1, 2.5).data);
    printf("%s\n", makePair_string_i32(STR_LIT("hi"), 3).data);
    return 0;
}
