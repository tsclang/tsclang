#include "runtime.h"

int main(void) {
    TSC_INIT();
    opt_string s = {true, STR_LIT("hello")};
    const String r = (s.has_value && s.value.length > 0) ? STR_LIT("yes") : STR_LIT("no");
    printf("%s\n", r.data);
    tsc_string_release(r);
    return 0;
}
