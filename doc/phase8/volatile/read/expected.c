#include "runtime.h"

volatile uint8_t reg = 0xFF;

int main(void) {
    TSC_INIT();
    const uint8_t v = reg;
    printf("%u\n", v);
    return 0;
}
