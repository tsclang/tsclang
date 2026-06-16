#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t x = 1;
    int32_t y = 2;
    printf("%d\n", (int32_t)((uint32_t)x + (uint32_t)y));
    return 0;
}
