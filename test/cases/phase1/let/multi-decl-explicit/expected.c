#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t x = 1;
    int32_t y = 2;
    printf("%d\n", x + y);
    return 0;
}