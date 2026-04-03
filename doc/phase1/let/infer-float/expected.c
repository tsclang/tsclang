#include "runtime.h"

int main(void) {
    TSC_INIT();
    double x = 3.14;
    printf("%g\n", x);
    return 0;
}
