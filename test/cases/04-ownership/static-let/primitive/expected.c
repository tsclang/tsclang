#include "runtime.h"

static int32_t x = 42;

int main(void) {
    TSC_INIT();
    printf("%d\n", x);
    return 0;
}
