#include "runtime.h"

int main(void) {
    TSC_INIT();
    const String s = STR_LIT("hello world");
    printf("%s\n", tsc_string_ends_with(s, STR_LIT("world")) ? "true" : "false");
    printf("%s\n", tsc_string_ends_with(s, STR_LIT("hello")) ? "true" : "false");
    tsc_string_release(s);
    return 0;
}
