#include "runtime.h"

int main(void) {
    TSC_INIT();
    int64_t a = 1LL;
    uint32_t b = 2U;
    const double c = (double)((int64_t)((uint64_t)a + (uint64_t)(int64_t)b));
    printf("%s\n", tsc_dtoa((double)(c)));
    return 0;
}
