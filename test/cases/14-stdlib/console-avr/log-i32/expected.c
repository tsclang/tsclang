#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t x = 42;
    printf("%ld\n", (long)x);
    return 0;
}
