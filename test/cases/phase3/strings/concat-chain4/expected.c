#include "runtime.h"

int main(void) {
    TSC_INIT();
    const String a = STR_LIT("hello");
    const String b = STR_LIT(" ");
    const String c = STR_LIT("world");
    const String d = STR_LIT("!");
    String e = tsc_string_concat_n((String[]){ a, b, c, d }, 4);
    printf("%s\n", e.data);
    tsc_string_release(e);
    tsc_string_release(d);
    tsc_string_release(c);
    tsc_string_release(b);
    tsc_string_release(a);
    return 0;
}
