#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t big = 200;
    d8_t s = (big < ((INT8_MIN) / 100)) ? (d8_t)(INT8_MIN) : ((big > ((INT8_MAX) / 100)) ? (d8_t)(INT8_MAX) : (d8_t)((big) * 100));
    return 0;
}
