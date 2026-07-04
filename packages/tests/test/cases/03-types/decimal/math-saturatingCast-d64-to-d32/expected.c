#include "runtime.h"

int main(void) {
    TSC_INIT();
    d64_t a = 99999999999999LL;
    d32_t b = (a < (INT32_MIN)) ? (d32_t)(INT32_MIN) : ((a > (INT32_MAX)) ? (d32_t)(INT32_MAX) : (d32_t)((a) / 10000LL));
    return 0;
}
