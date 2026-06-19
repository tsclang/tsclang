#include "runtime.h"

int main(void) {
    TSC_INIT();
    const int32_t x = -1;
    printf("%d\n", (int32_t)((uint32_t)x >> 28));
    return 0;
}
