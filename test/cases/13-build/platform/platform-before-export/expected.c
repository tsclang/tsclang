#include "runtime.h"

String greet_string(String name) {
    return tsc_string_concat(STR_LIT("hello "), name);
}

int main(void) {
    TSC_INIT();
    String _tmp_0 = greet_string(STR_LIT("world"));
    printf("%s\n", _tmp_0.data);
    tsc_string_release(_tmp_0);
    return 0;
}
