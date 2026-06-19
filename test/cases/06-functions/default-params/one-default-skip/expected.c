#include "runtime.h"

int32_t add_i32_i32(int32_t x, int32_t y) {
    return (int32_t)((uint32_t)x + (uint32_t)y);
}

int main(void) {
    TSC_INIT();
    printf("%d\n", add_i32_i32(5, 10));
    return 0;
}
