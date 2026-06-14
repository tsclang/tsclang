#include "runtime.h"

int main(void) {
    TSC_INIT();
    const String a = STR_LIT("hi");
    const double b = 42.0;
    printf("%s\n", a.data);
    printf("%g\n", (double)(b));
    tsc_string_release(a);
    return 0;
}
