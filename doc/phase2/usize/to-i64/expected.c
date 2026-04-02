#include "runtime.h"

int main(void) {
    TSC_INIT();
    const size_t n = 100U;
    const int64_t m = (int64_t)n;
    printf("%lld\n", (long long)m);
    return 0;
}
