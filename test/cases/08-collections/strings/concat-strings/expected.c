#include "runtime.h"

int main(void) {
    TSC_INIT();
    const String a = STR_LIT("hello");
    const String b = STR_LIT(" world");
    String c = tsc_string_concat(a, b);
    printf("%s\n", c.data);
    tsc_string_release(c);
    tsc_string_release(b);
    tsc_string_release(a);
    return 0;
}
