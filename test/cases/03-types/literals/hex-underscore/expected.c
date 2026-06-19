#include "runtime.h"

int main(void) {
    TSC_INIT();
    const uint32_t mask = 0xFFFFFFFFU;
    const uint16_t flags = 0b10100101U;
    printf("%u\n", mask);
    printf("%u\n", (unsigned)flags);
    return 0;
}
