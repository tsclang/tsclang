#include "runtime.h"

int main(void) {
    TSC_INIT();
    d32_t a = 15000;
    d32_t b = 37000;
    d32_t c = (a < b) ? a : b;
    d32_t d = (a > b) ? a : b;
    return 0;
}
