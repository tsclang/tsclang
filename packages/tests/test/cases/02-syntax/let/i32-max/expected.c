#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t x = 2147483647;
    printf("%d\n", x);
    return 0;
}
