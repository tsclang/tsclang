#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t a = 5;
    int32_t b = 40;
    int32_t c = 63;
    printf("%d %d %d\n", a, b, c);
    return 0;
}
