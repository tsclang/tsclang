#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t x = 42;
    int64_t y = (int64_t)x;
    printf("%lld\n", (long long)y);
    return 0;
}
