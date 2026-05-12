#include "runtime.h"

int main(void) {
    TSC_INIT();
    const int32_t x = (int32_t)3.14;
    printf("%d\n", x);
    return 0;
}
