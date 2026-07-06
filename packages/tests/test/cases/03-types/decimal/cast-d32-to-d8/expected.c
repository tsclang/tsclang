#include "runtime.h"

int main(void) {
    TSC_INIT();
    d32_t a = 15000;
    d8_t b = (d8_t)(a / 100);
    return 0;
}
