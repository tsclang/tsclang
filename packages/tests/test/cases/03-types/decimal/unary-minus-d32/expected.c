#include "runtime.h"

int main(void) {
    TSC_INIT();
    d32_t x = 15000;
    d32_t y = -x;
    String _tmp_0 = tsc_d32_to_string(y);
    printf("%s\n", _tmp_0.data);
    tsc_string_release(_tmp_0);
    return 0;
}
