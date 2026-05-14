#include "runtime.h"

int main(void) {
    TSC_INIT();
    const String s = STR_LIT("ABC");
    const uint8_t b = (uint8_t)s.data[0];
    printf("%u\n", (unsigned)b);
    tsc_string_release(s);
    return 0;
}
