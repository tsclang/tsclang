#include "runtime.h"

void foo_i32(int32_t x) {
    printf("%d\n", x);
}

void foo_i32_i32(int32_t x, int32_t y) {
    printf("%d\n", (int32_t)((uint32_t)x + (uint32_t)y));
}

int main(void) {
    TSC_INIT();
    foo_i32(5);
    foo_i32_i32(3, 4);
    return 0;
}
