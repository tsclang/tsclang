#include "runtime.h"

int main(void) {
    TSC_INIT();
    String s = tsc_string_concat(STR_LIT("aa"), STR_LIT("bb"));
    { String _tsc_tmp = tsc_string_concat(s, STR_LIT("cc")); tsc_string_release(s); s = _tsc_tmp; }
    printf("%s\n", s.data);
    tsc_string_release(s);
    return 0;
}
