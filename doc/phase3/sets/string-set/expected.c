#include "runtime.h"

int main(void) {
    TSC_INIT();
    TscSet_string s = tsc_set_create_string();
    tsc_set_add_string(&s, STR_LIT("hello"));
    tsc_set_add_string(&s, STR_LIT("world"));
    tsc_set_add_string(&s, STR_LIT("hello"));
    printf("%zu\n", s.size);
    printf("%s\n", tsc_set_has_string(&s, STR_LIT("hello")) ? "true" : "false");
    printf("%s\n", tsc_set_has_string(&s, STR_LIT("foo")) ? "true" : "false");
    return 0;
}

