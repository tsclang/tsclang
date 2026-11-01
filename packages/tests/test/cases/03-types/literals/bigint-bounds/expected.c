#include "runtime.h"

int main(void) {
    TSC_INIT();
    int64_t a = 9223372036854775807LL;
    int64_t b = (-9223372036854775807LL - 1);
    uint64_t c = 18446744073709551615ULL;
    printf("%lld\n", (long long)a);
    printf("%lld\n", (long long)b);
    printf("%llu\n", (unsigned long long)c);
    return 0;
}
