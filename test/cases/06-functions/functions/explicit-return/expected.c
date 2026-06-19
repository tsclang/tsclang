#include "runtime.h"

int32_t max_i32_i32(int32_t a, int32_t b) {
    if (a > b) {
        return a;
    }
    return b;
}

int main(void) {
    TSC_INIT();
    printf("%d\n", max_i32_i32(3, 7));
    return 0;
}
