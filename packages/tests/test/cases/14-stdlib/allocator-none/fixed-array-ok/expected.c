#include "runtime.h"

int main(void) {
    TSC_INIT();
    uint8_t buf[256] = {0};
    printf("%zu\n", (size_t)256);
    return 0;
}
