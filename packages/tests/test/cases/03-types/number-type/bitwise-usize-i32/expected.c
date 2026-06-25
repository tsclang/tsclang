#include "runtime.h"

int main(void) {
    TSC_INIT();
    size_t x = 5U;
    int32_t y = 3;
    size_t a = x & y;
    printf("%zu\n", a);
    return 0;
}
