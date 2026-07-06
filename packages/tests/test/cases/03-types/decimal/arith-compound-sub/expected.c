#include "runtime.h"

int main(void) {
    TSC_INIT();
    d32_t a = 50000;
    a -= 15000;
    return 0;
}
