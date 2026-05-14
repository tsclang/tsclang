#include "runtime.h"

typedef struct { bool has_value; double value; } opt_f64;

int main(void) {
    TSC_INIT();
    const String s = STR_LIT("bad");
    const opt_f64 n = tsc_try_parse_f64(s);
    if (!n.has_value) {
        printf("null\n");
    } else {
        printf("%g\n", n.value);
    }
    tsc_string_release(s);
    return 0;
}
