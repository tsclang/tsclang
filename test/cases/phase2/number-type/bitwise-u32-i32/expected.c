#include "runtime.h"

int main(void) {
    TSC_INIT();
    uint32_t x = 5U;
    int32_t y = 3;
    uint32_t a = x & y;
    printf("%u\n", a);
    return 0;
}
