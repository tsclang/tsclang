#include "runtime.h"

int main(void) {
    TSC_INIT();
    const uint8_t a = 65U;
    const uint8_t b = 66U;
    const uint8_t c = 10U;
    printf("%u\n", (unsigned)a);
    printf("%u\n", (unsigned)b);
    printf("%u\n", (unsigned)c);
    return 0;
}
