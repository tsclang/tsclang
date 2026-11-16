#include "runtime.h"

int main(void) {
    TSC_INIT();
    String a = tsc_string_concat(STR_LIT("aa"), STR_LIT("bb"));
    String b = STR_LIT("");
    { String _tsc_tmp = a; tsc_string_retain(_tsc_tmp); tsc_string_release(b); b = _tsc_tmp; }
    printf("%s\n", b.data);
    tsc_string_release(b);
    tsc_string_release(a);
    return 0;
}
