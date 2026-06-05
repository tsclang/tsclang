#include "runtime.h"

int main(void) {
    TSC_INIT();
    float x = 1.5f;
    printf("%g\n", (double)x);
    return 0;
}
