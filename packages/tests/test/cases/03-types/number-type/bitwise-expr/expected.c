#include "runtime.h"

int main(void) {
    TSC_INIT();
    double x = 7.0;
    double y = 3.0;
    double a = (double)(((int32_t)(x + 1)) & ((int32_t)(y + 1)));
    double b = (double)(((int32_t)(x * 2)) | ((int32_t)(y)));
    double c = (double)(((int32_t)(x + 1)) & ((int32_t)(y - 1)));
    double d = (double)(((int32_t)(x - 3)) ^ ((int32_t)(y + 2)));
    printf("%s\n", tsc_dtoa((double)(a)));
    printf("%s\n", tsc_dtoa((double)(b)));
    printf("%s\n", tsc_dtoa((double)(c)));
    printf("%s\n", tsc_dtoa((double)(d)));
    return 0;
}
