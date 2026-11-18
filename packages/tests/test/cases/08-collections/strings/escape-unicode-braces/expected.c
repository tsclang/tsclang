#include "runtime.h"

int main(void) {
    TSC_INIT();
    const String a = STR_LIT("A");
    const String b = STR_LIT("😀");
    printf("%s\n", (tsc_string_eq(a, STR_LIT("A"))) ? "true" : "false");
    printf("%zu\n", b.length);
    tsc_string_release(b);
    tsc_string_release(a);
    return 0;
}
