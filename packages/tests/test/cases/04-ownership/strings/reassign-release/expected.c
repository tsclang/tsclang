#include "runtime.h"

int main(void) {
    TSC_INIT();
    String s = STR_LIT("aaa");
    { String _tsc_tmp = tsc_string_concat_n((String[]){ STR_LIT("x"), STR_LIT("y"), STR_LIT("z") }, 3); tsc_string_release(s); s = _tsc_tmp; }
    printf("%s\n", s.data);
    tsc_string_release(s);
    return 0;
}
