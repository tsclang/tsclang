#include "runtime.h"

int main(void) {
    TSC_INIT();
    const double num = 42.0;
    String _tsc_cat_0 = tsc_f64_to_string(num);
    String _tmp_1 = tsc_string_concat(STR_LIT("x="), _tsc_cat_0);
    printf("%s\n", _tmp_1.data);
    tsc_string_release(_tsc_cat_0);
    tsc_string_release(_tmp_1);
    return 0;
}
