#include "runtime.h"

int main(void) {
    TSC_INIT();
    const uint8_t a = 200U;
    const int16_t b = a;
    printf("%d\n", (int)b);
    return 0;
}
