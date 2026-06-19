#include "runtime.h"

int main(void) {
    TSC_INIT();
    printf("%g\n", (double)(1 | 2 & 3));
    return 0;
}
