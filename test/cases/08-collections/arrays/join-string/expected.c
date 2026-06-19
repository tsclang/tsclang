#include "runtime.h"

int main(void) {
    TSC_INIT();
    String _lit_0[] = {STR_LIT("a"), STR_LIT("b"), STR_LIT("c")};
    const Array_string arr = {.data = _lit_0, .length = 3, .capacity = 3};
    const String s = tsc_array_join_string(arr, STR_LIT(", "));
    printf("%s\n", s.data);
    tsc_string_release(s);
    return 0;
}
