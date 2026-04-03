#include "runtime.h"

int main(void) {
    TSC_INIT();
    float x = 3.14f;
    printf("%g\n", (double)x);
    return 0;
}
