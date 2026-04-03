#include "runtime.h"

int main(void) {
    TSC_INIT();
    const String s = STR_LIT("hello world");
    printf("%s\n", tsc_string_includes(s, STR_LIT("world")) ? "true" : "false");
    return 0;
}
