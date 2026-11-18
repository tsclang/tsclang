#include "runtime.h"

int main(void) {
    TSC_INIT();
    const String s = STR_LIT("abcd");
    printf("%s\n", s.data);
    printf("%zu\n", s.length);
    tsc_string_release(s);
    return 0;
}
