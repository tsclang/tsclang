#include "runtime.h"
#include "std/regex.h"

typedef struct { bool has_value; Array_string value; } opt_Array_string;

int main(void) {
    TSC_INIT();
    TscRegex r = tsc_regex_compile(STR_LIT("(\\w+)"));
    opt_Array_string m = tsc_regex_match(&r, STR_LIT("hello world"));
    printf("%d\n", m.has_value);
    tsc_regex_free(&r);
    return 0;
}
