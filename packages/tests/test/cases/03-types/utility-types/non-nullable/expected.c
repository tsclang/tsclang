#include "runtime.h"

int main(void) {
    TSC_INIT();
    const String s = STR_LIT("hello");
    printf("%s\n", s.data);
    tsc_string_release(s);
    return 0;
}
