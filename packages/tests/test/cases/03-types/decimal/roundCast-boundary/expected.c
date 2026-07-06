#include "runtime.h"

int main(void) {
    TSC_INIT();
    d32_t a = 150;
    d8_t b = (d8_t)((a >= 0) ? ((a + 50) / 100) : ((a - 50) / 100));
    d32_t c = 149;
    d8_t d = (d8_t)((c >= 0) ? ((c + 50) / 100) : ((c - 50) / 100));
    return 0;
}
