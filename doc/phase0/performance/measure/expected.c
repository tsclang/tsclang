#include "runtime.h"

int main(void) {
    TSC_INIT();
    tsc_performance_mark(STR_LIT("start"));
    tsc_performance_mark(STR_LIT("end"));
    TscPerfEntry entry = tsc_performance_measure(STR_LIT("work"), STR_LIT("start"), STR_LIT("end"));
    printf("%s\n", entry.name.data);
    return 0;
}

