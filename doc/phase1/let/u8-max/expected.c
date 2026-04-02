#include "runtime.h"

int main(void) {
    TSC_INIT();
    uint8_t x = 255;
    printf("%u\n", x);
    return 0;
}
