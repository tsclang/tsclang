#include "runtime.h"

int main(void) {
    TSC_INIT();
    const char a = 65;
    const char b = 66U;
    const uint8_t c = 67U;
    printf("%c\n", a);
    printf("%c\n", b);
    printf("%u\n", (unsigned)c);
    return 0;
}
