#include "runtime.h"

int main(void) {
    TSC_INIT();
    printf("%g\n", 3.14);
    printf("%g\n", 0.5);
    printf("%g\n", 1.0);
    return 0;
}
