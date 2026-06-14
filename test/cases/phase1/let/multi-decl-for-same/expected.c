#include "runtime.h"

int main(void) {
    TSC_INIT();
    for (double x = 0, y = 10; x < y; x++) {
        printf("%g\n", (double)(x));
    }
    return 0;
}