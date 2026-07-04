#include "runtime.h"

int main(void) {
    TSC_INIT();
    d32_t d = 15000;
    d16_t n = (d16_t)(d / 100);
    return 0;
}
