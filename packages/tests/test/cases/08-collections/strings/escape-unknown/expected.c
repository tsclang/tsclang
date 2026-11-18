#include "runtime.h"

int main(void) {
    TSC_INIT();
    const String s = STR_LIT("aqb");
    const String bell = STR_LIT("a");
    printf("%s\n", s.data);
    printf("%zu\n", s.length);
    printf("%s\n", (tsc_string_eq(bell, STR_LIT("a"))) ? "true" : "false");
    tsc_string_release(bell);
    tsc_string_release(s);
    return 0;
}
