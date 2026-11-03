#include "runtime.h"

int main(void) {
    TSC_INIT();
    double au0024b = 1.0;
    printf("%s\n", tsc_dtoa((double)(au0024b)));
    return 0;
}
