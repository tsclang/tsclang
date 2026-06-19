#include "runtime.h"

int main(void) {
    TSC_INIT();
    const int32_t n = 42;
    String _tmp_0 = tsc_i32_to_string(n);
    printf("%s\n", _tmp_0.data);
    tsc_string_release(_tmp_0);
    return 0;
}
