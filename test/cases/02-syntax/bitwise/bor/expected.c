#include "runtime.h"

int main(void) {
    TSC_INIT();
    printf("%s\n", tsc_dtoa((double)(0b1010 | 0b0101)));
    return 0;
}
