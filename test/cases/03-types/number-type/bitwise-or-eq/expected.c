#include "runtime.h"

int main(void) {
    TSC_INIT();
    double x = 2.0;
    x = (double)(((int32_t)(x)) | ((int32_t)(8)));
    printf("%g\n", (double)(x));
    return 0;
}
