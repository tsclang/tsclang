#include "runtime.h"

int main(void) {
    TSC_INIT();
    String s = STR_LIT("hello world");
    tsc_print_str(s);
    printf("\n");
    tsc_string_release(s);
    return 0;
}
