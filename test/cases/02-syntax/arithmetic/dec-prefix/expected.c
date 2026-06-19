#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t x = 5;
    --x;
    printf("%d\n", x);
    return 0;
}
