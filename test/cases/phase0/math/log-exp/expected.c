#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    printf("%g\n", (double)(log(1)));
    printf("%g\n", (double)(log2(8)));
    printf("%g\n", (double)(log10(100)));
    printf("%g\n", (double)(exp(0)));
    return 0;
}
