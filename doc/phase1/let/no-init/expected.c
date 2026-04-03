#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t x;
    x = 99;
    printf("%d\n", x);
    return 0;
}
