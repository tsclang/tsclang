#include "runtime.h"

int32_t add_i32_i32(int32_t a, int32_t b) {
    return (int32_t)((uint32_t)a + (uint32_t)b);
}

int main(void) {
    TSC_INIT();
    const int32_t result = add_i32_i32(3, 4);
    printf("%d\n", result);
    return 0;
}
