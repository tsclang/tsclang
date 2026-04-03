#include "runtime.h"

int main(void) {
    TSC_INIT();
    uint64_t x = 0;
    printf("%llu\n", (unsigned long long)x);
    return 0;
}
