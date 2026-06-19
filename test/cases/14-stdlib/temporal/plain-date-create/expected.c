#include "runtime.h"
#include "std/temporal.h"

int main(void) {
    TSC_INIT();
    TscPlainDate d = tsc_plain_date_from(2024, 3, 15);
    printf("%d\n", d.year);
    return 0;
}
