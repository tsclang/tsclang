#include "runtime.h"

int main(void) {
    TSC_INIT();
    Date d = tsc_date_from_ms((int64_t)(1710936000000));
    printf("%d\n", tsc_date_get_full_year(d));
    printf("%d\n", tsc_date_get_month(d));
    printf("%d\n", tsc_date_get_date(d));
    printf("%d\n", tsc_date_get_hours(d));
    printf("%d\n", tsc_date_get_minutes(d));
    printf("%d\n", tsc_date_get_seconds(d));
    return 0;
}
