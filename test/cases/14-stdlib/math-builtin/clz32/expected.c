#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    printf("%d\n", (int32_t)__builtin_clz((uint32_t)(1)));
    printf("%d\n", (int32_t)__builtin_clz((uint32_t)(0x80000000)));
    return 0;
}
