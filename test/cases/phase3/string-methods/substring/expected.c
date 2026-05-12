#include "runtime.h"

int main(void) {
    TSC_INIT();
    const String s = STR_LIT("hello world");
    String _tmp_0 = tsc_string_substring(s, 6, 11);
    printf("%s\n", _tmp_0.data);
    tsc_string_free(_tmp_0);
    return 0;
}
