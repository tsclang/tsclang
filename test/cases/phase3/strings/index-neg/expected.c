#include "runtime.h"

int main(void) {
    TSC_INIT();
    const String s = STR_LIT("hello");
    const uint8_t last = (uint8_t)s.data[s.length - 1];
    printf("%u\n", (unsigned)last);
    return 0;
}
