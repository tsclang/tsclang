#include "runtime.h"

int32_t double_i32(int32_t x) {
    return x * 2;
}

int main(void) {
    TSC_INIT();
    const int32_t result = double_i32(21);
    printf("%d\n", result);
    return 0;
}
