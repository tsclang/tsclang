#include "runtime.h"

int main(void) {
    TSC_INIT();
    const uint8_t x = (uint8_t)300;
    printf("%u\n", (unsigned)x);
    return 0;
}
