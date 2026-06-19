#include "runtime.h"
#include "std/temporal.h"

int main(void) {
    TSC_INIT();
    TscPlainDate d1 = tsc_plain_date_from(2024, 1, 1);
    TscPlainDate d2 = tsc_plain_date_from(2024, 1, 11);
    TscDuration dur = tsc_plain_date_until(d1, d2);
    printf("%d\n", dur.days);
    return 0;
}
