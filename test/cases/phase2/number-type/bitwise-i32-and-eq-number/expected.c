#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t x = 7;
    double y = 3.0;
    x = (int32_t)(((int32_t)(x)) & ((int32_t)(y)));
    printf("%d\n", x);
    return 0;
}
