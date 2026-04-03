#include "runtime.h"

int main(void) {
    TSC_INIT();
    const String s = STR_LIT("ab");
    String _tmp_0 = tsc_string_repeat(s, 3);
    printf("%s\n", _tmp_0.data);
    tsc_string_free(_tmp_0);
    return 0;
}
