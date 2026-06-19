#include "runtime.h"

int main(void) {
    TSC_INIT();
    const uint16_t a = 60000U;
    const int32_t b = a;
    printf("%d\n", b);
    return 0;
}
