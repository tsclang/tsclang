#include "runtime.h"
#include "std/regex.h"

int main(void) {
    TSC_INIT();
    TscRegex r = tsc_regex_compile(STR_LIT("hello"));
    printf("%s\n", tsc_regex_test(&r, STR_LIT("say hello world")) ? "true" : "false");
    tsc_regex_free(&r);
    return 0;
}
