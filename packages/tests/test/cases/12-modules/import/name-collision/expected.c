#include "runtime.h"

int32_t a_helper_i32(int32_t x) {
    return x + 1;
}

int32_t a_fromA_i32(int32_t x) {
    return a_helper_i32(x);
}

int32_t b_helper_i32(int32_t x) {
    return x * 2;
}

int32_t b_fromB_i32(int32_t x) {
    return b_helper_i32(x);
}

int main(void) {
    TSC_INIT();
    printf("%d\n", a_fromA_i32(5));
    printf("%d\n", b_fromB_i32(5));
    return 0;
}
