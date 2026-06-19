#include "runtime.h"
#include "std/temporal.h"

int main(void) {
    TSC_INIT();
    TscZonedDateTime zdt = tsc_zoned_datetime_now(STR_LIT("UTC"));
    printf("%s\n", zdt.timeZone.data);
    return 0;
}
