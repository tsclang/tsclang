#include "runtime.h"

int32_t utils_add_i32_i32(int32_t a, int32_t b) {
    return a + b;
}

int main(void) {
    TSC_INIT();
    printf("%d\n", utils_add_i32_i32(3, 4));
    return 0;
}
