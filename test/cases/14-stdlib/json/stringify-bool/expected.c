#include "runtime.h"

int main(void) {
    TSC_INIT();
    const bool b = true;
    const String s = (b) ? STR_LIT("true") : STR_LIT("false");
    printf("%s\n", s.data);
    tsc_string_release(s);
    return 0;
}
