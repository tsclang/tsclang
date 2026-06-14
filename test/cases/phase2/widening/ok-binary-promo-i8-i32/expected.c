#include "runtime.h"

int main(void) {
    TSC_INIT();
    int8_t a = 1;
    int32_t b = 2;
    int32_t x = a + b;
    printf("%d\n", x);
    return 0;
}
