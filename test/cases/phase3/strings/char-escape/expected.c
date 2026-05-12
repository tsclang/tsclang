#include "runtime.h"

int main(void) {
    TSC_INIT();
    const uint8_t nl = 10U;
    printf("%u\n", (unsigned)nl);
    return 0;
}
