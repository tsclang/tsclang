#include "runtime.h"

int main(void) {
    TSC_INIT();
    Date d = tsc_date_from_ms((int64_t)(1710936000000));
    printf("%s\n", tsc_date_to_iso_string(d).data);
    return 0;
}
