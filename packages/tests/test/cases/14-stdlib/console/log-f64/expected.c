#include "runtime.h"

int main(void) {
    TSC_INIT();
    printf("%s\n", tsc_dtoa((double)(3.14)));
    return 0;
}
