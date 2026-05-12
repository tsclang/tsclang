#include "runtime.h"

String lib_greet_string(String name) {
    return tsc_string_concat(STR_LIT("hello "), name);
}

static const int32_t VERSION = 1;

int main(void) {
    TSC_INIT();
    printf("%s\n", lib_greet_string(STR_LIT("world")).data);
    printf("%d\n", VERSION);
    return 0;
}
