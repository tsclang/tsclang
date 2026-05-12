#include "runtime.h"

int main(void) {
    TSC_INIT();
    tsc_performance_mark(STR_LIT("start"));
    tsc_performance_mark(STR_LIT("end"));
    printf("marked\n");
    return 0;
}

