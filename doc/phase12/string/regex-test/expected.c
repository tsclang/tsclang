#include "runtime.h"
#include "std/regex.h"

int main(void) {
    TSC_INIT();
    TscRegex r = tsc_regex_compile(STR_LIT("^\\d+$"));
    printf("%s\n", tsc_regex_test(&r, STR_LIT("123")) ? "true" : "false");
    printf("%s\n", tsc_regex_test(&r, STR_LIT("abc")) ? "true" : "false");
    tsc_regex_free(&r);
    return 0;
}
