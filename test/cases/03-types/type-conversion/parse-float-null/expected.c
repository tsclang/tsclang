#include "runtime.h"

typedef struct { bool has_value; double value; } opt_f64;

int main(void) {
    TSC_INIT();
    opt_f64 x = tsc_parse_float(STR_LIT("abc"));
    printf("%s\n", x.has_value ? "some" : "null");
    return 0;
}
