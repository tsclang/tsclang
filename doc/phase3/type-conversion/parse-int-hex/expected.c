#include "runtime.h"

typedef struct { bool has_value; int32_t value; } opt_i32;

int main(void) {
    TSC_INIT();
    opt_i32 x = tsc_parse_int(STR_LIT("0xFF"));
    printf("%d\n", x.value);
    return 0;
}
