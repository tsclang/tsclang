#include "runtime.h"

int main(void) {
    TSC_INIT();
    float x = 5.0f;
    float y = 3.0f;
    float a = (float)(((int32_t)(x)) & ((int32_t)(y)));
    printf("%s\n", tsc_dtoa((double)a));
    return 0;
}
