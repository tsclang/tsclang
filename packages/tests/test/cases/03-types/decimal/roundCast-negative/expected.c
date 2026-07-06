#include "runtime.h"

int main(void) {
    TSC_INIT();
    d32_t a = -19900;
    int32_t b = (int32_t)((a >= 0) ? ((a + 5000) / 10000) : ((a - 5000) / 10000));
    d32_t c = -15000;
    d16_t e = (d16_t)((a >= 0) ? ((a + 50) / 100) : ((a - 50) / 100));
    return 0;
}
