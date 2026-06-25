#include "runtime.h"

int main(void) {
    TSC_INIT();
    const String s = STR_LIT("hello");
    opt_u8 c = tsc_string_at(s, 100);
    printf("%s\n", c.has_value ? "some" : "null");
    tsc_string_release(s);
    return 0;
}
