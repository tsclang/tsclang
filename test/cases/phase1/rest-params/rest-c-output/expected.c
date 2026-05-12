#include "runtime.h"

int32_t join_i32(int32_t sep, int32_t *nums, int32_t nums_count) {
    int32_t result = 0;
    for (int32_t i = 0; i < nums_count; i++) {
        result = result + nums[i] + sep;
    }
    return result;
}

int main(void) {
    TSC_INIT();
    int32_t _rest_0[] = {10, 20, 30};
    printf("%d\n", join_i32(0, _rest_0, 3));
    return 0;
}
