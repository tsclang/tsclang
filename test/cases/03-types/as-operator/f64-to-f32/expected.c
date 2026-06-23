#include "runtime.h"

int main(void) {
    TSC_INIT();
    const double a = 1.5;
    const float b = (float)a;
    printf("%s\n", tsc_dtoa((double)b));
    return 0;
}
