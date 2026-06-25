#include "runtime.h"

int main(void) {
    TSC_INIT();
    uint32_t x = 4294967295U;
    printf("%u\n", x);
    return 0;
}
