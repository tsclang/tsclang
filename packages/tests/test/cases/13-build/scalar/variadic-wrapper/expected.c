#include "runtime.h"
#include <stdio.h>

void log_string(const char *fmt, ...) {
    va_list _va_args;
    va_start(_va_args, fmt);
    vprintf(fmt, _va_args);
    va_end(_va_args);
}

int main(void) {
    TSC_INIT();
    log_string("%d %s\n", 10, "items");
    return 0;
}
