#include "runtime.h"

int32_t sum_i32_i32_i32(int32_t a, int32_t b, int32_t c) {
    return a + b + c;
}

int main(void) {
    TSC_INIT();
    int32_t arr[] = {1, 2, 3};
    printf("%d\n", sum_i32_i32_i32(arr[0], arr[1], arr[2]));
    return 0;
}
