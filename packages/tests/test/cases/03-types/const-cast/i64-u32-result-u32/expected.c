#include "runtime.h"

int main(void) {
    TSC_INIT();
    const int64_t a = 1LL;
    const uint32_t b = 2U;
    const uint32_t c = (uint32_t)(a + (int64_t)b);
    printf("%u\n", c);
    return 0;
}
