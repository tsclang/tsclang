#include "runtime.h"

int main(void) {
    TSC_INIT();
    d8_t a = 50;
    d16_t b = (d16_t)a;
    return 0;
}
