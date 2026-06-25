#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t x = 0;
    double y = 1.5;
    for (; x < 3; x++) {
        printf("%d\n", x);
        printf("%s\n", tsc_dtoa((double)(y)));
    }
    return 0;
}
