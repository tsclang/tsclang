#include "runtime.h"

int main(void) {
    TSC_INIT();
    const String s = STR_LIT("hello hello");
    String r = tsc_string_replace(s, STR_LIT("hello"), STR_LIT("world"));
    printf("%s\n", r.data);
    tsc_string_release(r);
    tsc_string_release(s);
    return 0;
}
