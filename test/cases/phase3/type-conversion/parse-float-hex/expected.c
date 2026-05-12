#include "runtime.h"

typedef struct { bool has_value; double value; } opt_f64;

int main(void) {
    TSC_INIT();
    opt_f64 x = tsc_parse_float(STR_LIT("0xFF"));
    opt_f64 y = tsc_parse_float(STR_LIT("0b1010"));
    opt_f64 z = tsc_parse_float(STR_LIT("0o77"));
    printf("%g\n", x.value);
    printf("%g\n", y.value);
    printf("%g\n", z.value);
    return 0;
}
