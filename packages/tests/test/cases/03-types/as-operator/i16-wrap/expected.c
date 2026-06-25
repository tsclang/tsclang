#include "runtime.h"

int main(void) {
    TSC_INIT();
    const int8_t x = (int8_t)1000;
    printf("%d\n", (int)x);
    return 0;
}
