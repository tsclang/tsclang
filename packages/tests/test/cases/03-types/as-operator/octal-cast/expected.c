#include "runtime.h"

int main(void) {
    TSC_INIT();
    const int32_t a = 0777;
    const uint16_t b = (uint16_t)a;
    printf("%u\n", (unsigned)b);
    return 0;
}
