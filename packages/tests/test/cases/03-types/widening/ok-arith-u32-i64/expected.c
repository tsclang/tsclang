#include "runtime.h"

int main(void) {
    TSC_INIT();
    uint32_t a = 1U;
    int64_t b = 2LL;
    int64_t c = (int64_t)a + b;
    printf("%lld\n", (long long)c);
    return 0;
}
