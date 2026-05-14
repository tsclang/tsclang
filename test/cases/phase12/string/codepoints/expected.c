#include "runtime.h"

int main(void) {
    TSC_INIT();
    const String s = STR_LIT("abc");
    TscCodePointIter _cp_iter_0 = tsc_codepoints(s);
    uint32_t _cp_0;
    while (tsc_codepoints_next(&_cp_iter_0, &_cp_0)) {
        const uint32_t cp = _cp_0;
        printf("%u\n", cp);
    }
    tsc_string_release(s);
    return 0;
}
