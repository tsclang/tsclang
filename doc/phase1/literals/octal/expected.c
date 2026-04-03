#include "runtime.h"

int main(void) {
    TSC_INIT();
    const int32_t x = 077;
    printf("%d\n", x);
    return 0;
}
