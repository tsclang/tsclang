#include "runtime.h"

int main(void) {
    TSC_INIT();
    float x = 3.14f;
    printf("%s\n", tsc_dtoa((double)x));
    return 0;
}
