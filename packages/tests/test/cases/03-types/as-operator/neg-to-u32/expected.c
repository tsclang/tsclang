#include "runtime.h"

int main(void) {
    TSC_INIT();
    const uint32_t x = (uint32_t)-1;
    printf("%u\n", x);
    return 0;
}
