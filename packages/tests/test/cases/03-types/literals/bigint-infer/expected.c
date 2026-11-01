#include "runtime.h"

int main(void) {
    TSC_INIT();
    int64_t a = 42LL;
    uint64_t b = 9223372036854775808ULL;
    printf("%lld\n", (long long)a);
    printf("%llu\n", (unsigned long long)b);
    return 0;
}
