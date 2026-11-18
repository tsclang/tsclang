#include "runtime.h"

int main(void) {
    TSC_INIT();
    const String s = STR_LIT("😀");
    String r = {0};
    if (tsc_string_eq(s, STR_LIT("😀"))) { r = STR_LIT("emoji"); }
    else { r = STR_LIT("other"); }
    printf("%s\n", r.data);
    tsc_string_release(s);
    return 0;
}
