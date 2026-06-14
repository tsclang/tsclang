#include "runtime.h"

int16_t add_i16_i16(int16_t a, int16_t b) {
    return a + b;
}

int main(void) {
    TSC_INIT();
    const int16_t x = 15;
    const int16_t y = 25;
    printf("%d\n", (int)add_i16_i16(x, y));
    return 0;
}
