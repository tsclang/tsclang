#include "runtime.h"

int main(void) {
    TSC_INIT();
    d32_t d = 15000;
    int32_t i = (int32_t)(d / 10000);
    printf("%d\n", i);
    return 0;
}
