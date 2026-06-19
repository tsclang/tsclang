#include "runtime.h"

int main(void) {
    TSC_INIT();
    const int32_t x = 42;
    printf("value = %d\n", x);
    return 0;
}
