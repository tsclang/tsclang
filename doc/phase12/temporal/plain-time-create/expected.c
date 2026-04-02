#include "runtime.h"
#include "std/temporal.h"

int main(void) {
    TSC_INIT();
    TscPlainTime t = tsc_plain_time_from(14, 30, 0);
    printf("%d\n", t.hour);
    printf("%d\n", t.minute);
    return 0;
}
