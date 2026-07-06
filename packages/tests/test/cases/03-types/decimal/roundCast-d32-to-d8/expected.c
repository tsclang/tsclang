#include "runtime.h"

int main(void) {
    TSC_INIT();
    d32_t a = 190;
    d8_t b = (d8_t)((a >= 0) ? ((a + 50) / 100) : ((a - 50) / 100));
    return 0;
}
