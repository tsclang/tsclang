#include "runtime.h"

int main(void) {
    TSC_INIT();
    double x = 5.0;
    double y = 3.0;
    double a = (double)(((int32_t)(x)) | ((int32_t)(y)));
    double b = (double)(((int32_t)(x)) | ((int32_t)(8)));
    printf("%s\n", tsc_dtoa((double)(a)));
    printf("%s\n", tsc_dtoa((double)(b)));
    return 0;
}
