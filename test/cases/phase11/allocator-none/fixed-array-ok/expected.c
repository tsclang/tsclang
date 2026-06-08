#include "runtime.h"

int main(void) {
    TSC_INIT();
    uint8_t buf[256] = {0};
    printf("%u\n", (unsigned)(size_t)256);
    return 0;
}
