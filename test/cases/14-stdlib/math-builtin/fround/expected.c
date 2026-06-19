#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    const float x = (float)(1.5);
    printf("%g\n", (double)x);
    return 0;
}
