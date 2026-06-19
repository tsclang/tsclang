#include "runtime.h"

int main(void) {
    TSC_INIT();
    const int32_t x = 1000000;
    printf("%d\n", x);
    return 0;
}
