#include "runtime.h"

int main(void) {
    TSC_INIT();
    const String s = STR_LIT("😀");
    printf("%s\n", (tsc_string_eq(s, STR_LIT("😀"))) ? "true" : "false");
    printf("%zu\n", s.length);
    tsc_string_release(s);
    return 0;
}
