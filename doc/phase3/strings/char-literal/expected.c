#include "runtime.h"

int main(void) {
    TSC_INIT();
    const uint8_t c = 65U;
    printf("%u\n", (unsigned)c);
    return 0;
}
