#include "runtime.h"

int main(void) {
    TSC_INIT();
    const int32_t a = 0b10100101;
    const uint8_t b = (uint8_t)a;
    printf("%u\n", (unsigned)b);
    return 0;
}
