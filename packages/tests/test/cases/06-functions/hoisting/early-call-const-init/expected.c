#include "runtime.h"

static double late = 41.0;

double readEarly(void) {
    return late + 1;
}

int main(void) {
    TSC_INIT();
    printf("%s\n", tsc_dtoa((double)(readEarly())));
    return 0;
}
