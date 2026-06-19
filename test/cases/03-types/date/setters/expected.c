#include "runtime.h"

int main(void) {
    TSC_INIT();
    Date d = tsc_date_from_ms((int64_t)(0));
    tsc_date_set_full_year(&d, 2024);
    tsc_date_set_month(&d, 2);
    tsc_date_set_date(&d, 20);
    printf("%d\n", tsc_date_get_full_year(d));
    printf("%d\n", tsc_date_get_month(d));
    printf("%d\n", tsc_date_get_date(d));
    return 0;
}
