#include "runtime.h"

typedef struct { bool has_value; double value; } opt_f64;

int main(void) {
    TSC_INIT();
    opt_f64 a = tsc_try_parse_f64(STR_LIT("3.14"));
    opt_f64 b = tsc_try_parse_f64(STR_LIT("0xFF"));
    opt_f64 c = tsc_try_parse_f64(STR_LIT("abc"));
    printf("%g\n", a.value);
    printf("%g\n", b.value);
    printf("%s\n", c.has_value ? "some" : "null");
    return 0;
}
