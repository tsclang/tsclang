#include "runtime.h"

int32_t getValue(void) {
    return 100;
}

int main(void) {
    TSC_INIT();
    const int32_t x = getValue();
    printf("%d\n", x);
    return 0;
}
