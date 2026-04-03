#include "runtime.h"

int main(void) {
    TSC_INIT();
    const int32_t a = 7;
    const double b = a;
    printf("%g\n", b);
    return 0;
}
