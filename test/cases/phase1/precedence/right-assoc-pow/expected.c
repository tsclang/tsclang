#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    printf("%g\n", pow(2.0, pow(3.0, 2.0)));
    return 0;
}
