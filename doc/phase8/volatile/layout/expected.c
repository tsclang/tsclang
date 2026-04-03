#include "runtime.h"

int main(void) {
    TSC_INIT();
    volatile uint32_t *reg = (volatile uint32_t *)0x40020000U;
    return 0;
}
