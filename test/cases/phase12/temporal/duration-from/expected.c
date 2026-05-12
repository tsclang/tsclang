#include "runtime.h"
#include "std/temporal.h"

int main(void) {
    TSC_INIT();
    TscDuration d = tsc_duration_from_hms(2, 30, 0);
    printf("%d\n", d.hours);
    printf("%d\n", d.minutes);
    return 0;
}
