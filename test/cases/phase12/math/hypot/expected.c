#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    printf("%g\n", hypot(3.0, 4.0));
    return 0;
}
