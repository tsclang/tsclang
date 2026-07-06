#include "runtime.h"

int main(void) {
    TSC_INIT();
    d32_t x = 25000;
    String _tsc_cat_0 = tsc_d32_to_string(x);
    String _tmp_1 = tsc_string_concat(_tsc_cat_0, STR_LIT("abc"));
    printf("%s\n", _tmp_1.data);
    tsc_string_release(_tsc_cat_0);
    tsc_string_release(_tmp_1);
    return 0;
}
