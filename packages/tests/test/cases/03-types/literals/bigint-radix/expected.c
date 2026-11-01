#include "runtime.h"

int main(void) {
    TSC_INIT();
    uint64_t a = 0xFFU;
    int64_t b = 0b1010LL;
    int64_t c = 017LL;
    printf("%llu\n", (unsigned long long)a);
    printf("%lld\n", (long long)b);
    printf("%lld\n", (long long)c);
    return 0;
}
