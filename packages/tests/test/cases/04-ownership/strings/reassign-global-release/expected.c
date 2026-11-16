#include "runtime.h"

static String g = STR_LIT("aaa");

void bump(void) {
    { String _tsc_tmp = tsc_string_concat(STR_LIT("x"), STR_LIT("y")); tsc_string_release(g); g = _tsc_tmp; }
}

int main(void) {
    TSC_INIT();
    bump();
    printf("%s\n", g.data);
    tsc_string_release(g);
    return 0;
}
