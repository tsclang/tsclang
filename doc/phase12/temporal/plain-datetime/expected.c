#include "runtime.h"
#include "std/temporal.h"

int main(void) {
    TSC_INIT();
    TscPlainDate d = tsc_plain_date_from(2024, 1, 1);
    TscPlainTime t = tsc_plain_time_from(12, 0, 0);
    TscPlainDateTime dt = tsc_plain_datetime_from(d, t);
    printf("%d\n", dt.year);
    printf("%d\n", dt.hour);
    return 0;
}
