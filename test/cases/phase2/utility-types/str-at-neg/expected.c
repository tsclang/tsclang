#include "runtime.h"

int main(void) {
    TSC_INIT();
    const String s = STR_LIT("hello");
    opt_u8 c = tsc_string_at(s, -1);
    printf("%u\n", (unsigned)c.value);
    return 0;
}
