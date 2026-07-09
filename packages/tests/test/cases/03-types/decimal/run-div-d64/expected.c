#include "runtime.h"

int main(void) {
    TSC_INIT();
    d64_t a = 300000000LL;
    d64_t b = 200000000LL;
    d64_t _tsc_div_0 = b;
    if (_tsc_div_0 == 0) { fprintf(stderr, "panic[E401]: division by zero\n"); abort(); }
    String _tmp_1 = tsc_d64_to_string(tsc_div_d64(a, _tsc_div_0));
    printf("%s\n", _tmp_1.data);
    tsc_string_release(_tmp_1);
    d64_t c = 100000000LL;
    d64_t d = 300000000LL;
    d64_t _tsc_div_2 = d;
    if (_tsc_div_2 == 0) { fprintf(stderr, "panic[E401]: division by zero\n"); abort(); }
    String _tmp_3 = tsc_d64_to_string(tsc_div_d64(c, _tsc_div_2));
    printf("%s\n", _tmp_3.data);
    tsc_string_release(_tmp_3);
    d64_t e = 200000000LL;
    d64_t f = 300000000LL;
    d64_t _tsc_div_4 = f;
    if (_tsc_div_4 == 0) { fprintf(stderr, "panic[E401]: division by zero\n"); abort(); }
    String _tmp_5 = tsc_d64_to_string(tsc_div_d64(e, _tsc_div_4));
    printf("%s\n", _tmp_5.data);
    tsc_string_release(_tmp_5);
    return 0;
}
