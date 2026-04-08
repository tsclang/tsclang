#include "runtime.h"

int main(void) {
    TSC_INIT();
    uint16_t x = 0U;
    printf("%u\n", (unsigned)x);
    return 0;
}
