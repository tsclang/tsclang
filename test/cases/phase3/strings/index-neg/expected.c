#include "runtime.h"

int main(void) {
    TSC_INIT();
    const String s = STR_LIT("hello");
    const uint8_t last = (uint8_t)TSC_STRING_GET_CHAR(s, s.length - 1);
    printf("%u\n", (unsigned)last);
    tsc_string_release(s);
    return 0;
}
