#include "runtime.h"

int main(void) {
    TSC_INIT();
    const String s = STR_LIT("3.14");
    const double n = tsc_parse_f64(s);
    printf("%g\n", n);
    tsc_string_release(s);
    return 0;
}
