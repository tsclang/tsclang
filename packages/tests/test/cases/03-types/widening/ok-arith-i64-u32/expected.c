#include "runtime.h"

int main(void) {
    TSC_INIT();
    int64_t a = 1LL;
    uint32_t b = 2U;
    int64_t c = a + (int64_t)b;
    printf("%lld\n", (long long)c);
    return 0;
}
