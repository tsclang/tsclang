#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t a = 1;
    uint32_t b = 2U;
    int32_t x = (int32_t)((uint32_t)a + (uint32_t)(int32_t)b);
    printf("%d\n", x);
    return 0;
}
