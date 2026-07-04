#include "runtime.h"

int main(void) {
    TSC_INIT();
    d32_t a = 15000;
    d32_t b = 5000;
    d32_t c = a + b;
    printf("%d\n", c);
    return 0;
}
