#include "runtime.h"

int main(void) {
    TSC_INIT();
    d32_t a = 15000;
    d32_t b = 25000;
    bool lt = a < b;
    bool eq = a == b;
    return 0;
}
