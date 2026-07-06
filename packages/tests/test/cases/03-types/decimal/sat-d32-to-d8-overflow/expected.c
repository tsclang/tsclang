#include "runtime.h"

int main(void) {
    TSC_INIT();
    d32_t a = 5000000;
    d8_t b = (a < ((INT8_MIN) * 100)) ? (d8_t)(INT8_MIN) : ((a > ((INT8_MAX) * 100)) ? (d8_t)(INT8_MAX) : (d8_t)((a) / 100));
    return 0;
}
