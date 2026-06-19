#include "runtime.h"

int main(void) {
    TSC_INIT();
    printf("%g\n", (double)(1e3));
    printf("%g\n", (double)(2.5e-2));
    return 0;
}
