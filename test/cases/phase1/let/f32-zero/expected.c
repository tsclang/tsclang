#include "runtime.h"

int main(void) {
    TSC_INIT();
    float x = 0.0f;
    printf("%g\n", (double)x);
    return 0;
}
