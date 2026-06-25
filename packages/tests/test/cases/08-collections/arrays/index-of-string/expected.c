#include "runtime.h"

int main(void) {
    TSC_INIT();
    String _lit_0[] = {STR_LIT("foo"), STR_LIT("bar"), STR_LIT("baz")};
    const Array_string a = {.data = _lit_0, .length = 3, .capacity = 3};
    printf("%d\n", (int)tsc_array_index_of_string(a, STR_LIT("bar")));
    printf("%d\n", (int)tsc_array_index_of_string(a, STR_LIT("qux")));
    return 0;
}
