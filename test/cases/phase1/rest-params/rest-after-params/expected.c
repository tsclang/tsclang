#include "runtime.h"

int32_t multiply_i32(int32_t factor, int32_t *nums, int32_t nums_count) {
    int32_t result = 0;
    for (int32_t i = 0; i < nums_count; i++) {
        result = result + factor * nums[i];
    }
    return result;
}

int main(void) {
    TSC_INIT();
    int32_t _rest_0[] = {1, 3, 5};
    printf("%d\n", multiply_i32(2, _rest_0, 3));
    return 0;
}
