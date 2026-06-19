#include "runtime.h"
#include "std/temporal.h"

int main(void) {
    TSC_INIT();
    TscInstant now = tsc_instant_now();
    printf("%s\n", (now.epochNanoseconds > 0) ? "true" : "false");
    return 0;
}
