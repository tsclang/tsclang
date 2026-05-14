#include "runtime.h"

String process_i32(int32_t x) {
    tsc_string_retain(STR_LIT("processed"));
    return STR_LIT("processed");
}

String process_f64(double x) {
    tsc_string_retain(STR_LIT("processed"));
    return STR_LIT("processed");
}

int main(void) {
    TSC_INIT();
    const String a = process_i32(42);
    const String b = process_f64(3.14);
    printf("%s\n", a.data);
    printf("%s\n", b.data);
    tsc_string_release(b);
    tsc_string_release(a);
    return 0;
}
