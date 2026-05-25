#include "runtime.h"

int main(void) {
    TSC_INIT();
    printf("%g\n", (double)(3.14));
    return 0;
}
