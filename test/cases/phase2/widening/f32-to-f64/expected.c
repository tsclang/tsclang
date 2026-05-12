#include "runtime.h"

int main(void) {
    TSC_INIT();
    const float a = 1.5f;
    const double b = a;
    printf("%g\n", b);
    return 0;
}
