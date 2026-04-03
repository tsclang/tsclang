#include "runtime.h"
#include "std/regex.h"

int main(void) {
    TSC_INIT();
    TscRegex r = tsc_regex_compile(STR_LIT("o"));
    String result = tsc_regex_replace_all(&r, STR_LIT("hello world"), STR_LIT("0"));
    printf("%s\n", result.data);
    tsc_regex_free(&r);
    return 0;
}
