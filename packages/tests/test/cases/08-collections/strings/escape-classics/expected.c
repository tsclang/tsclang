#include "runtime.h"

int main(void) {
    TSC_INIT();
    const String s = STR_LIT("a\tb\nc\\d\"e'f\x00g");
    printf("%zu\n", s.length);
    printf("%u\n", (unsigned)(uint8_t)TSC_STRING_GET_CHAR(s, 1));
    printf("%u\n", (unsigned)(uint8_t)TSC_STRING_GET_CHAR(s, 5));
    printf("%u\n", (unsigned)(uint8_t)TSC_STRING_GET_CHAR(s, 11));
    tsc_string_release(s);
    return 0;
}
