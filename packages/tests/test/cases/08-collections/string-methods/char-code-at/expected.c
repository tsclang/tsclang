#include "runtime.h"

int main(void) {
    TSC_INIT();
    const String s = STR_LIT("ABC");
    printf("%u\n", (unsigned)(uint8_t)TSC_STRING_GET_CHAR(s, 0));
    tsc_string_release(s);
    return 0;
}
