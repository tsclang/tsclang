#include "runtime.h"

int32_t factorial_i32(int32_t n) {
    if (n <= 1) {
        return 1;
    }
    return (int32_t)((uint32_t)n * (uint32_t)factorial_i32(n - 1));
}

int main(void) {
    TSC_INIT();
    printf("%d\n", factorial_i32(5));
    return 0;
}
