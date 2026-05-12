#include "runtime.h"

int main(void) {
    TSC_INIT();
    const int64_t ts = tsc_date_now();
    printf("%s\n", (ts > 0) ? "true" : "false");
    return 0;
}
