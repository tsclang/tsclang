#include "runtime.h"

int main(void) {
    TSC_INIT();
    const int32_t age = 30;
    String _tsc_cat_0 = tsc_i32_to_string(age);
    String msg = tsc_string_concat(STR_LIT("age: "), _tsc_cat_0);
    tsc_string_release(_tsc_cat_0);
    printf("%s\n", msg.data);
    tsc_string_release(msg);
    return 0;
}
