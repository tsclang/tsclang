#include "runtime.h"

typedef struct { bool has_value; int32_t value; } opt_i32;

int main(void) {
    TSC_INIT();
    const opt_i32 x = {true, 42};
    const int32_t y = x.has_value ? x.value : 99;
    printf("%d\n", y);
    return 0;
}
