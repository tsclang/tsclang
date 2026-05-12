#include "runtime.h"

int main(void) {
    TSC_INIT();
    const uint32_t a = 42U;
    const double b = a;
    printf("%g\n", b);
    return 0;
}
