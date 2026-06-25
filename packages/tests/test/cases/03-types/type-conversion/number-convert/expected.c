#include "runtime.h"

int main(void) {
    TSC_INIT();
    const int32_t x = 42;
    const double f = (double)x;
    const int32_t back = (int32_t)f;
    printf("%d\n", back);
    return 0;
}
