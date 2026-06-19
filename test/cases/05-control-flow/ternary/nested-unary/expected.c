#include "runtime.h"

int main(void) {
    TSC_INIT();
    const int32_t a = 1;
    const int32_t b = 2;
    const int32_t c = 3;
    const int32_t x = (a < b) ? ((b < c) ? -1 : 0) : 1;
    printf("%d\n", x);
    return 0;
}
