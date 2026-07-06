#include "runtime.h"

int main(void) {
    TSC_INIT();
    d32_t x = 25000;
    char _buf_0[64];
    snprintf(_buf_0, sizeof(_buf_0), "%.2f", (double)(x) / 10000.0);
    printf("%s\n", STR_LIT_RUNTIME(_buf_0).data);
    return 0;
}
