#include "runtime.h"

int main(void) {
    TSC_INIT();
    String a = STR_LIT("hello");
    tsc_string_retain(a);
    String b = a;
    printf("%s\n", a.data);
    printf("%s\n", b.data);
    tsc_string_release(b);
    tsc_string_release(a);
    return 0;
}
