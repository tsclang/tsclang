#include "runtime.h"

int main(void) {
    TSC_INIT();
    double x = 5.0;
    char c = 97U;
    double a = (double)(((int32_t)(x)) & ((int32_t)(c)));
    char b = (double)(((int32_t)(c)) & ((int32_t)(x)));
    printf("%g\n", (double)(a));
    printf("%c\n", b);
    return 0;
}
