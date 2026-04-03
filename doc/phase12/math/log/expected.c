#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    const double v = log(2.718281828);
    printf("%g\n", v);
    return 0;
}
