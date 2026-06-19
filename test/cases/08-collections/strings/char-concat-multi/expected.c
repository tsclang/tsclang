#include "runtime.h"

int main(void) {
    TSC_INIT();
    String s = tsc_string_concat_n((String[]){ STR_LIT("hello"), STR_LIT(" "), STR_LIT("world") }, 3);
    printf("%s\n", s.data);
    tsc_string_release(s);
    return 0;
}
