#include "runtime.h"

int main(void) {
    TSC_INIT();
    const int32_t z = 30;
    printf("%d\n", z);
    return 0;
}
