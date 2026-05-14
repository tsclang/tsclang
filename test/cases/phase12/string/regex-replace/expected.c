#include "runtime.h"
#include "std/regex.h"

int main(void) {
    TSC_INIT();
    TscRegex r = tsc_regex_compile(STR_LIT("world"));
    String result = tsc_regex_replace(&r, STR_LIT("hello world"), STR_LIT("TSClang"));
    printf("%s\n", result.data);
    tsc_string_release(result);
    tsc_regex_free(&r);
    return 0;
}
