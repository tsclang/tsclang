#include "runtime.h"

int main(void) {
    TSC_INIT();
    d8_t a = 50;
    d32_t b = (d32_t)(a * 100);
    return 0;
}
