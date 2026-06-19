#include "runtime.h"

int main(void) {
    TSC_INIT();
    const String s = STR_LIT("5");
    String _tmp_0 = tsc_string_pad_start(s, 3, STR_LIT("0"));
    printf("%s\n", _tmp_0.data);
    tsc_string_release(_tmp_0);
    tsc_string_release(s);
    return 0;
}
