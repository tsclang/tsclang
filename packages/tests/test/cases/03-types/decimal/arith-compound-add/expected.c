#include "runtime.h"

int main(void) {
    TSC_INIT();
    d32_t a = 15000;
    a += (d32_t)1;
    return 0;
}
