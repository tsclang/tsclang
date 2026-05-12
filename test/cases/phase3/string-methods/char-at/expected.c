#include "runtime.h"

int main(void) {
    TSC_INIT();
    const String s = STR_LIT("hello");
    String _tmp_0 = tsc_string_char_at(s, 1);
    printf("%s\n", _tmp_0.data);
    tsc_string_free(_tmp_0);
    return 0;
}
