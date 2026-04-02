#include "runtime.h"

int main(void) {
    TSC_INIT();
    const int32_t a = -1;
    const uint32_t b = 2U;
    const double c = (double)((int32_t)(a + (int32_t)b));
    printf("%g\n", c);
    return 0;
}
