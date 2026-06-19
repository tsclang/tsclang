#include "runtime.h"

int main(void) {
    TSC_INIT();
    printf("%g\n", 42.0);
    printf("%g\n", 0.0);
    printf("%g\n", -1.0);
    return 0;
}
