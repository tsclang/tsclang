#include "runtime.h"

int main(void) {
    TSC_INIT();
    const uint32_t a = 4000000000U;
    const uint64_t b = a;
    printf("%llu\n", (unsigned long long)b);
    return 0;
}
