#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t a = 1;
    uint32_t b = 2U;
    uint32_t x = a + b;
    printf("%u\n", x);
    return 0;
}
