#include "runtime.h"

int main(void) {
    TSC_INIT();
    double x = 5.0;
    bool b = true;
    double a = (double)(((int32_t)(x)) & ((int32_t)(b)));
    bool c = (double)(((int32_t)(b)) & ((int32_t)(x)));
    double d = (double)(((int32_t)(x)) & ((int32_t)(true)));
    printf("%g\n", (double)(a));
    printf("%s\n", (c) ? "true" : "false");
    printf("%g\n", (double)(d));
    return 0;
}
