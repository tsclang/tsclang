#include "runtime.h"

int main(void) {
    TSC_INIT();
    const float a = 1.5f;
    const double b = a;
    printf("%s\n", tsc_dtoa((double)(b)));
    return 0;
}
