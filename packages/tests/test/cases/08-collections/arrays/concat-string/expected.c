#include "runtime.h"

int main(void) {
    TSC_INIT();
    String _lit_0[] = {STR_LIT("hello"), STR_LIT("world")};
    const Array_string a = {.data = _lit_0, .length = 2, .capacity = 2};
    String _lit_1[] = {STR_LIT("foo")};
    const Array_string b = {.data = _lit_1, .length = 1, .capacity = 1};
    Array_string c = tsc_array_concat_string(a, b);
    printf("%zu\n", c.length);
    printf("%s\n", c.data[2].data);
    tsc_array_free_string(&c);
    return 0;
}
