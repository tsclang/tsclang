#include "runtime.h"

int main(void) {
    TSC_INIT();
    String s = STR_LIT("hello");
    double count = 0.0;
    TscCodePointIter _cp_iter_0 = tsc_codepoints(s);
    uint32_t _cp_0 = 0;
    while (tsc_codepoints_next(&_cp_iter_0, &_cp_0)) {
        const uint32_t cp = _cp_0;
        count++;
    }
    printf("%s\n", tsc_dtoa((double)(count)));
    tsc_string_release(s);
    return 0;
}
