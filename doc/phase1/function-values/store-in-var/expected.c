#include "runtime.h"

int32_t double_i32(int32_t x) {
    return x * 2;
}

int main(void) {
    TSC_INIT();
    int32_t (*fn)(int32_t) = double_i32;
    printf("%d\n", fn(5));
    return 0;
}
