#include "runtime.h"

int main(void) {
    TSC_INIT();
    printf("%s\n", (((double)(1) == tsc_string_to_number(STR_LIT("1")))) ? "true" : "false");
    printf("%s\n", (((double)(1) == tsc_string_to_number(STR_LIT("2")))) ? "true" : "false");
    return 0;
}
