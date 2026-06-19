#include "runtime.h"

int main(void) {
    TSC_INIT();
    printf("%g\n", (double)(0b1010 | 0b0101));
    return 0;
}
