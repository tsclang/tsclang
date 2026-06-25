#include "runtime.h"
#include "std/regex.h"

int main(void) {
    TSC_INIT();
    TscRegex r = tsc_regex_compile(STR_LIT("\\d+"));
    const int32_t pos = tsc_regex_search(&r, STR_LIT("abc123"));
    printf("%d\n", pos);
    tsc_regex_free(&r);
    return 0;
}
