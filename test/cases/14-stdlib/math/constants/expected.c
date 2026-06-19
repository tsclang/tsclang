#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    printf("%g\n", (double)(M_PI));
    printf("%g\n", (double)(M_E));
    return 0;
}
