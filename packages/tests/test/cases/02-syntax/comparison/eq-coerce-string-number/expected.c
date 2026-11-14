#include "runtime.h"

int main(void) {
    TSC_INIT();
    String s = STR_LIT("1");
    printf("%s\n", ((tsc_string_to_number(s) == (double)(1))) ? "true" : "false");
    tsc_string_release(s);
    return 0;
}
