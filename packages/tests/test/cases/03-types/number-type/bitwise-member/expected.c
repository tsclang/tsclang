#include "runtime.h"

typedef struct { double val; } _anon_0;

int main(void) {
    TSC_INIT();
    _anon_0 obj = {.val = 5};
    double x = (double)(((int32_t)(obj.val)) & ((int32_t)(3)));
    printf("%s\n", tsc_dtoa((double)(x)));
    return 0;
}
