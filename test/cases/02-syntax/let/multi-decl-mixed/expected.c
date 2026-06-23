#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t x = 1;
    double y = 2.0;
    printf("%d\n", x);
    printf("%s\n", tsc_dtoa((double)(y)));
    return 0;
}
