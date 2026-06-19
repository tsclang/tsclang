#include "runtime.h"

typedef struct { bool has_value; int32_t value; } opt_i32;

int main(void) {
    TSC_INIT();
    opt_i32 n = tsc_i32_try_parse(STR_LIT("42"));
    printf("%d\n", n.value);
    return 0;
}
