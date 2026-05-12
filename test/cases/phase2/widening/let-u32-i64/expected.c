#include "runtime.h"

int main(void) {
    TSC_INIT();
    uint32_t a = 10U;
    int64_t b = (int64_t)a + 1LL;
    printf("%lld\n", (long long)b);
    return 0;
}
