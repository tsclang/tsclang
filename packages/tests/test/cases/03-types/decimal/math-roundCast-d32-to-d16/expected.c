#include "runtime.h"

int main(void) {
    TSC_INIT();
    d32_t a = 35678;
    d16_t b = (d16_t)((a >= 0) ? ((a + 50) / 100) : ((a - 50) / 100));
    return 0;
}
