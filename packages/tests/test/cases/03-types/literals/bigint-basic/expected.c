#include "runtime.h"

int main(void) {
    TSC_INIT();
    int64_t a = 42LL;
    uint64_t b = 42U;
    int64_t c = -42;
    printf("%lld\n", (long long)a);
    printf("%llu\n", (unsigned long long)b);
    printf("%lld\n", (long long)c);
    return 0;
}
