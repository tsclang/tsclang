#include "runtime.h"

int main(void) {
    TSC_INIT();
    d64_t a = 150000000LL;
    d64_t b = 200000000LL;
    String _tmp_0 = tsc_d64_to_string(tsc_mul_d64(a, b));
    printf("%s\n", _tmp_0.data);
    tsc_string_release(_tmp_0);
    d64_t c = 10000000LL;
    d64_t d = 10000000LL;
    String _tmp_1 = tsc_d64_to_string(tsc_mul_d64(c, d));
    printf("%s\n", _tmp_1.data);
    tsc_string_release(_tmp_1);
    d64_t e = 9999900000000LL;
    d64_t f = 50000000LL;
    String _tmp_2 = tsc_d64_to_string(tsc_mul_d64(e, f));
    printf("%s\n", _tmp_2.data);
    tsc_string_release(_tmp_2);
    return 0;
}
