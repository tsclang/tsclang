#include "runtime.h"

int main(void) {
    TSC_INIT();
    bool flag = true;
    printf("%s\n", (((flag ? 1.0 : 0.0) != tsc_string_to_number(STR_LIT("true")))) ? "true" : "false");
    printf("%s\n", (((flag ? 1.0 : 0.0) == tsc_string_to_number(STR_LIT("1")))) ? "true" : "false");
    printf("%s\n", (((false ? 1.0 : 0.0) == tsc_string_to_number(STR_LIT("")))) ? "true" : "false");
    return 0;
}
