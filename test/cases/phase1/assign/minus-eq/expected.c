#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t x = 10;
    x = (int32_t)((uint32_t)x - (uint32_t)3);
    printf("%d\n", x);
    return 0;
}
