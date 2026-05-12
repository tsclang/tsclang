#include "runtime.h"

int main(void) {
    TSC_INIT();
    int64_t a = 1LL;
    uint32_t b = 2U;
    const double c = (double)(a + (int64_t)b);
    printf("%g\n", c);
    return 0;
}
