#include "runtime.h"

int main(void) {
    TSC_INIT();
    printf("%s\n", tsc_dtoa((double)(-8 >> 1)));
    return 0;
}
