#include "runtime.h"

static double limit = 41.0;

double readConfig(void) {
    return limit + 1;
}

int main(void) {
    TSC_INIT();
    printf("%s\n", tsc_dtoa((double)(readConfig())));
    return 0;
}
