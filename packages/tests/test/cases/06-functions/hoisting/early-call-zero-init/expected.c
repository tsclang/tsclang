#include "runtime.h"

static double late = 0.0;

double initLate(void) {
    return 41;
}

double readEarly(void) {
    return late + 1;
}

int main(void) {
    TSC_INIT();
    printf("%s\n", tsc_dtoa((double)(readEarly())));
    late = initLate();
    return 0;
}
