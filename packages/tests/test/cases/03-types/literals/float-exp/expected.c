#include "runtime.h"

int main(void) {
    TSC_INIT();
    printf("%s\n", tsc_dtoa((double)(1e3)));
    printf("%s\n", tsc_dtoa((double)(2.5e-2)));
    return 0;
}
