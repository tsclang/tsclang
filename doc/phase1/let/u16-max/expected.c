#include "runtime.h"

int main(void) {
    TSC_INIT();
    uint16_t x = 65535;
    printf("%u\n", x);
    return 0;
}
