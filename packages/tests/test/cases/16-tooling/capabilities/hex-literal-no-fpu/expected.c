#include "runtime.h"

int main(void) {
    TSC_INIT();
    const int16_t x = 0xFF;
    printf("%d\n", (int)x);
    return 0;
}
