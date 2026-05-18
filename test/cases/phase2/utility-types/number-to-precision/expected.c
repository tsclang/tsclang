#include "runtime.h"

int main(void) {
    TSC_INIT();
    char _buf_0[64];
    snprintf(_buf_0, sizeof(_buf_0), "%.*g", 4, 3.14159);
    const String x = STR_LIT_RUNTIME(_buf_0);
    printf("%s\n", x.data);
    tsc_string_release(x);
    return 0;
}
