#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    double a = 3.6;
    int32_t b = (int32_t)round(a);
    return 0;
}
