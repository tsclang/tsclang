#include "runtime.h"

int main(void) {
    TSC_INIT();
    const int32_t x = 0xFF;
    const int32_t y = 0x1A2B;
    printf("%d\n", x);
    printf("%d\n", y);
    return 0;
}
