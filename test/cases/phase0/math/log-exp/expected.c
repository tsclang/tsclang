#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    printf("%g\n", log(1));
    printf("%g\n", log2(8));
    printf("%g\n", log10(100));
    printf("%g\n", exp(0));
    return 0;
}
