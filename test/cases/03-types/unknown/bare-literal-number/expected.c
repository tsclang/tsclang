#include "runtime.h"

int main(void) {
    TSC_INIT();
    double a = 100.0;
    double b = 100500.0;
    int32_t c = 100500;
    printf("%g\n", (double)(a));
    printf("%g\n", (double)(b));
    printf("%d\n", c);
    return 0;
}
