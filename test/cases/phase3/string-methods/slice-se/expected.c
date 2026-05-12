#include "runtime.h"

int main(void) {
    TSC_INIT();
    const String s = STR_LIT("hello world");
    String sub = tsc_string_slice(s, 0, 5);
    printf("%s\n", sub.data);
    tsc_string_free(sub);
    return 0;
}
