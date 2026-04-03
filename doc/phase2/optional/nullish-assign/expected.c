#include "runtime.h"

typedef struct { bool has_value; int32_t value; } opt_i32;

int main(void) {
    TSC_INIT();
    opt_i32 x = {false, 0};
    if (!x.has_value) { x = (opt_i32){true, 5}; }
    printf("%d\n", x.value);
    return 0;
}
