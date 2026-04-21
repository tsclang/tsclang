#include "runtime.h"

int32_t helper_i32(int32_t x) {
    return x + 1;
}

int32_t fromA_i32(int32_t x) {
    return helper_i32(x);
}

int32_t helper_i32(int32_t x) {
    return x * 2;
}

int32_t fromB_i32(int32_t x) {
    return helper_i32(x);
}

int main(void) {
    TSC_INIT();
    printf("%d\n", fromA_i32(5));
    printf("%d\n", fromB_i32(5));
    return 0;
}
