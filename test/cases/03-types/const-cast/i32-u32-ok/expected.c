#include "runtime.h"

int main(void) {
    TSC_INIT();
    const int32_t a = -1;
    const uint32_t b = 2U;
    const double c = (double)(a + (int32_t)b);
    printf("%s\n", tsc_dtoa((double)(c)));
    return 0;
}
