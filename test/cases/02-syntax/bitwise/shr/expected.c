#include "runtime.h"

int main(void) {
    TSC_INIT();
    printf("%g\n", (double)(-8 >> 1));
    return 0;
}
