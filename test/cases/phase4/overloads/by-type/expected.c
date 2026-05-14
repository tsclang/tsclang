#include "runtime.h"

String process_i32(int32_t x) {
    tsc_string_retain(tsc_string_concat(STR_LIT("int: "), tsc_i32_to_string(x)));
    return tsc_string_concat(STR_LIT("int: "), tsc_i32_to_string(x));
}

String process_string(String x) {
    tsc_string_retain(tsc_string_concat(STR_LIT("str: "), x));
    return tsc_string_concat(STR_LIT("str: "), x);
}

int main(void) {
    TSC_INIT();
    String _tmp_0 = process_i32(42);
    printf("%s\n", _tmp_0.data);
    tsc_string_release(_tmp_0);
    String _tmp_1 = process_string(STR_LIT("hello"));
    printf("%s\n", _tmp_1.data);
    tsc_string_release(_tmp_1);
    return 0;
}
