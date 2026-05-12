#include "runtime.h"
#include "std/temporal.h"

int main(void) {
    TSC_INIT();
    TscPlainDate d = tsc_plain_date_from(2024, 1, 1);
    TscDuration dur = tsc_duration_from_days(10);
    TscPlainDate result = tsc_plain_date_add(d, dur);
    printf("%d\n", result.day);
    return 0;
}
