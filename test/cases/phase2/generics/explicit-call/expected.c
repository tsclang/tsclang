#include "runtime.h"

int32_t wrap_i32(int32_t x) {
    return x;
}

int main(void) {
    TSC_INIT();
    const int32_t a = wrap_i32(10);
    const int32_t b = wrap_i32(20);
    printf("%d\n", a + b);
    return 0;
}
