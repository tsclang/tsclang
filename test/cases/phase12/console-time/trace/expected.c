#include "runtime.h"

int main(void) {
    TSC_INIT();
    tsc_console_time(STR_LIT("op"));
    int32_t sum = 0;
    for (int32_t i = 0; i < 100; i++) {
        sum += i;
    }
    tsc_console_time_end(STR_LIT("op"));
    tsc_console_trace(STR_LIT("done"));
    return 0;
}
