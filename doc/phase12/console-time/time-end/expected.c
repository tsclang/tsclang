#include "runtime.h"

int main(void) {
    TSC_INIT();
    tsc_console_time(STR_LIT("op"));
    int32_t x = 0;
    for (int32_t i = 0; i < 1000; i++) {
        x = x + i;
    }
    tsc_console_time_end(STR_LIT("op"));
    printf("%d\n", x);
    return 0;
}
