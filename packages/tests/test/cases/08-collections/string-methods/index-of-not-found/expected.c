#include "runtime.h"

int main(void) {
    TSC_INIT();
    const String s = STR_LIT("hello");
    printf("%d\n", (int)tsc_string_index_of(s, STR_LIT("xyz")));
    tsc_string_release(s);
    return 0;
}
