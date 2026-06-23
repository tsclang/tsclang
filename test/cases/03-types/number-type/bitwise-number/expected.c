#include "runtime.h"

int main(void) {
    TSC_INIT();
    double x = 5.0;
    double a = (double)(((int32_t)(x)) & ((int32_t)(3)));
    double b = (double)(((int32_t)(x)) | ((int32_t)(8)));
    double c = (double)(((int32_t)(x)) ^ ((int32_t)(1)));
    double d = (double)(((int32_t)(x)) << ((int32_t)(1)));
    double e = (double)(((int32_t)(x)) >> ((int32_t)(1)));
    printf("%s\n", tsc_dtoa((double)(a)));
    printf("%s\n", tsc_dtoa((double)(b)));
    printf("%s\n", tsc_dtoa((double)(c)));
    printf("%s\n", tsc_dtoa((double)(d)));
    printf("%s\n", tsc_dtoa((double)(e)));
    return 0;
}
