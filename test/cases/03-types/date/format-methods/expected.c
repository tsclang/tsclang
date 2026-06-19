#include "runtime.h"

int main(void) {
    TSC_INIT();
    Date d = tsc_date_from_ms((int64_t)(1700000000000));
    printf("%s\n", tsc_date_to_date_string(d).data);
    printf("%s\n", tsc_date_to_time_string(d).data);
    printf("%s\n", tsc_date_to_iso_string(d).data);
    printf("%s\n", tsc_date_to_locale_date_string(d).data);
    printf("%s\n", tsc_date_to_locale_time_string(d).data);
    printf("%s\n", tsc_date_to_locale_string(d).data);
    return 0;
}
