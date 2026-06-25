#include "runtime.h"

int main(void) {
    TSC_INIT();
    uint8_t x = 255U;
    printf("%u\n", (unsigned)x);
    return 0;
}
