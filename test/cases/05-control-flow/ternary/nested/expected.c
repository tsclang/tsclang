#include "runtime.h"

int main(void) {
    TSC_INIT();
    const int32_t x = (true) ? ((false) ? 1 : 2) : 3;
    printf("%d\n", x);
    return 0;
}
