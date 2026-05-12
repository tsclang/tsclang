#include "runtime.h"

int main(void) {
    TSC_INIT();
    const int32_t x = 42;
    printf("%d\n", x);
    return 0;
}
