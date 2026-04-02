#include "runtime.h"

int main(void) {
    TSC_INIT();
    const String s = STR_LIT("hello");
    printf("%s\n", tsc_string_includes(s, STR_LIT("xyz")) ? "true" : "false");
    return 0;
}
