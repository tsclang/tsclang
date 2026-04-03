#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    printf("%g\n", round(3.6));
    printf("%g\n", round(3.4));
    return 0;
}
