#include "runtime.h"

int main(void) {
    TSC_INIT();
    printf("%s\n", ((tsc_string_to_number(STR_LIT(" 1 ")) == (double)(1))) ? "true" : "false");
    printf("%s\n", ((tsc_string_to_number(STR_LIT("0x1A")) == (double)(26))) ? "true" : "false");
    double big = 1e308;
    printf("%s\n", ((tsc_string_to_number(STR_LIT("Infinity")) == (double)(big * big))) ? "true" : "false");
    printf("%s\n", ((tsc_string_to_number(STR_LIT("abc")) == (double)(big * big))) ? "true" : "false");
    return 0;
}
