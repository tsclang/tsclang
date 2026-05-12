#include "runtime.h"

static int32_t MathUtils_add(int32_t a, int32_t b) {
    return a + b;
}

int main(void) {
    TSC_INIT();
    printf("%d\n", MathUtils_add(3, 4));
    return 0;
}
