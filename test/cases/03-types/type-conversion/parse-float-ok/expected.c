#include "runtime.h"

typedef struct { bool has_value; double value; } opt_f64;

int main(void) {
    TSC_INIT();
    opt_f64 x = tsc_parse_float(STR_LIT("3.14"));
    printf("%g\n", x.value);
    return 0;
}
