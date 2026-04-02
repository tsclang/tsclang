#include "runtime.h"

int32_t square_i32(int32_t x) {
    return x * x;
}

int32_t addOne_i32(int32_t x) {
    return x + 1;
}

int main(void) {
    TSC_INIT();
    printf("%d\n", square_i32(addOne_i32(3)));
    return 0;
}
