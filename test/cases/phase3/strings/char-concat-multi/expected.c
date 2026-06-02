#include "runtime.h"

int main(void) {
    TSC_INIT();
    String s = tsc_string_concat(tsc_string_concat(STR_LIT("hello"), STR_LIT(" ")), STR_LIT("world"));
    printf("%s\n", s.data);
    tsc_string_release(s);
    return 0;
}
