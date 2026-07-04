#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t i = 5;
    d32_t d = (d32_t)(i * 10000);
    printf("%d\n", d);
    return 0;
}
