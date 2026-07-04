#include "runtime.h"

int main(void) {
    TSC_INIT();
    d32_t a = -35000;
    d32_t b = (d32_t)(((a > 0) - (a < 0)) * 10000);
    return 0;
}
