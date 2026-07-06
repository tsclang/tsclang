#include "runtime.h"

int main(void) {
    TSC_INIT();
    d16_t a = 127;
    d8_t b = (d8_t)a;
    return 0;
}
