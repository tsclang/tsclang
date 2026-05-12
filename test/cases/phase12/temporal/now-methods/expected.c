#include "runtime.h"
#include "std/temporal.h"

int main(void) {
    TSC_INIT();
    TscPlainDate d = tsc_now_plain_date(STR_LIT("UTC"));
    printf("%s\n", (d.year > 2020) ? "true" : "false");
    TscInstant i = tsc_instant_now();
    printf("%s\n", (i.epochNanoseconds > 0) ? "true" : "false");
    return 0;
}
