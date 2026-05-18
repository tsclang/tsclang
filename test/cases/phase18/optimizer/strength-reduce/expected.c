#include "runtime.h"

int32_t f_i32(int32_t x) {
    return x + x;
}

int32_t g_i32(int32_t x) {
    return x << 2;
}

int32_t h_i32(int32_t x) {
    return x << 3;
}

int main(void) {
    TSC_INIT();
    printf("%d\n", f_i32(3));
    printf("%d\n", g_i32(5));
    printf("%d\n", h_i32(7));
    return 0;
}
