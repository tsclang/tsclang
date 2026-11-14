#include "runtime.h"

int main(void) {
    TSC_INIT();
    printf("%s\n", (((double)(1) == tsc_string_to_number(STR_LIT("a")))) ? "true" : "false");
    printf("%s\n", (((double)(2) == tsc_string_to_number(STR_LIT("12px")))) ? "true" : "false");
    printf("%s\n", (((true ? 1.0 : 0.0) == tsc_string_to_number(STR_LIT("true")))) ? "true" : "false");
    printf("%s\n", (((double)(0) == tsc_string_to_number(STR_LIT("")))) ? "true" : "false");
    return 0;
}
