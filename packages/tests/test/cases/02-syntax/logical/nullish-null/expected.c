#include "runtime.h"

typedef struct { bool has_value; int32_t value; } opt_i32;

int main(void) {
    TSC_INIT();
    opt_i32 x = {false, 0};
    int32_t y = x.has_value ? x.value : 42;
    printf("%d\n", y);
    return 0;
}
