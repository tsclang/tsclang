#include "runtime.h"

int main(void) {
    TSC_INIT();
    const int32_t a = 5;
    const int32_t b = 40;
    const int32_t c = 63;
    printf("%d %d %d\n", a, b, c);
    return 0;
}
