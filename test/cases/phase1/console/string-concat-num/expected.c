#include "runtime.h"

int main(void) {
    TSC_INIT();
    const int32_t num = 42;
    String _tmp_0 = tsc_string_concat(STR_LIT("x="), tsc_i32_to_string(num));
    printf("%s\n", _tmp_0.data);
    tsc_string_release(_tmp_0);
    return 0;
}
