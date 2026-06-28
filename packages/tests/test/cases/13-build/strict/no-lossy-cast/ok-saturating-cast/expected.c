#include "runtime.h"

int main(void) {
    TSC_INIT();
    int64_t big = 5000000000LL;
    int32_t clamped = (big < (INT32_MIN)) ? (int32_t)(INT32_MIN) : ((big > (INT32_MAX)) ? (int32_t)(INT32_MAX) : (int32_t)(big));
    printf("%d\n", clamped);
    return 0;
}
