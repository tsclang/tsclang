#include "runtime.h"

void greet_string(String who) {
    String _tmp_0 = tsc_string_concat(STR_LIT("Hello, "), who);
    printf("%s\n", _tmp_0.data);
    tsc_string_release(_tmp_0);
}

int main(void) {
    TSC_INIT();
    int32_t x = 42;
    const String name = STR_LIT("TSClang");
    greet_string(name);
    printf("x = %d\n", x);
    tsc_string_release(name);
    return 0;
}
