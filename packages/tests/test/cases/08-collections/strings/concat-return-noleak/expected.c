#include "runtime.h"

String tag_i32(int32_t x) {
    String _tsc_cat_0 = tsc_i32_to_string(x);
    String _ret_1 = tsc_string_concat(STR_LIT("val="), _tsc_cat_0);
    tsc_string_release(_tsc_cat_0);
    return _ret_1;
}

int main(void) {
    TSC_INIT();
    printf("%s\n", tag_i32(42).data);
    return 0;
}
