#include "runtime.h"

void _tsc_main(void) {
    String s = tsc_string_concat(tsc_f64_to_string(1), STR_LIT(" android"));
    printf("%s\n", s.data);
    tsc_string_release(s);
}

int main(void) {
    TSC_INIT();
    _tsc_main();
    return 0;
}
