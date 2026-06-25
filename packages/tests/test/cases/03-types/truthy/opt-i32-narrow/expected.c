#include "runtime.h"

typedef struct { bool has_value; int32_t value; } opt_i32;

int main(void) {
    TSC_INIT();
    opt_i32 x = {true, 7};
    if (x.has_value && x.value != 0) {
        printf("%s\n", tsc_dtoa((double)(x.value + 1)));
    }
    return 0;
}
