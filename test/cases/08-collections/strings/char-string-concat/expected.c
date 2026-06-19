#include "runtime.h"

int main(void) {
    TSC_INIT();
    const String a = STR_LIT("A");
    const String b = STR_LIT("B");
    String _tmp_0 = tsc_string_concat(a, b);
    printf("%s\n", _tmp_0.data);
    tsc_string_release(_tmp_0);
    tsc_string_release(b);
    tsc_string_release(a);
    return 0;
}
