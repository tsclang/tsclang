#include "runtime.h"

int main(void) {
    TSC_INIT();
    d32_t a = 35000;
    int32_t b = (int32_t)((a >= 0) ? ((a + 5000) / 10000) : ((a - 5000) / 10000));
    return 0;
}
