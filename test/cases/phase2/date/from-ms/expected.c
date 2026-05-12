#include "runtime.h"

int main(void) {
    TSC_INIT();
    Date d = tsc_date_from_ms((int64_t)(1710936000000));
    printf("%lld\n", (long long)tsc_date_get_time(d));
    return 0;
}
