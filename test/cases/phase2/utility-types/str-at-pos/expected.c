#include "runtime.h"

int main(void) {
    TSC_INIT();
    const String s = STR_LIT("hello");
    opt_u8 _at_0 = tsc_string_at(s, 0);
    printf("%u\n", (unsigned)_at_0.value);
    opt_u8 _at_1 = tsc_string_at(s, -1);
    printf("%u\n", (unsigned)_at_1.value);
    tsc_string_release(s);
    return 0;
}
