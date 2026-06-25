#include "runtime.h"

int main(void) {
    TSC_INIT();
    String _lit_0[] = {STR_LIT("foo"), STR_LIT("bar"), STR_LIT("baz")};
    const Array_string a = {.data = _lit_0, .length = 3, .capacity = 3};
    printf("%s\n", tsc_array_includes_string(a, STR_LIT("bar")) ? "true" : "false");
    printf("%s\n", tsc_array_includes_string(a, STR_LIT("qux")) ? "true" : "false");
    return 0;
}
