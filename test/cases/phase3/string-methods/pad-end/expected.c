#include "runtime.h"

int main(void) {
    TSC_INIT();
    const String s = STR_LIT("hi");
    String _tmp_0 = tsc_string_pad_end(s, 5, STR_LIT("."));
    printf("%s\n", _tmp_0.data);
    tsc_string_free(_tmp_0);
    return 0;
}
