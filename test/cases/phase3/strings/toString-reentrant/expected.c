#include "runtime.h"

int main(void) {
    TSC_INIT();
    String a = tsc_f64_to_string(1);
    String b = tsc_f64_to_string(2);
    String c = tsc_f64_to_string(3);
    printf("%s\n", a.data);
    printf("%s\n", b.data);
    printf("%s\n", c.data);
    tsc_string_release(c);
    tsc_string_release(b);
    tsc_string_release(a);
    return 0;
}
