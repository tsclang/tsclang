#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t x = 5;
    int32_t y = 3;
    int32_t a = x & y;
    printf("%d\n", a);
    return 0;
}
