#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t x = 1;
    x = 2;
    printf("%d\n", x);
    return 0;
}
