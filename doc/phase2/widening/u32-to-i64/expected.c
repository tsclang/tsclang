#include "runtime.h"

int main(void) {
    TSC_INIT();
    const uint32_t a = 3000000000U;
    const int64_t b = a;
    printf("%lld\n", (long long)b);
    return 0;
}
