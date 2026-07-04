#include "runtime.h"

int main(void) {
    TSC_INIT();
    d16_t w = 50;
    d32_t d = (d32_t)(w * 100);
    return 0;
}
