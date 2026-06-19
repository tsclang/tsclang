#include "runtime.h"

int main(void) {
    TSC_INIT();
    int8_t a = 1;
    int32_t b = 2;
    int32_t x = (int32_t)((uint32_t)a + (uint32_t)b);
    printf("%d\n", x);
    return 0;
}
