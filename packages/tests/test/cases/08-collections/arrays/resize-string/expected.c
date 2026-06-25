#include "runtime.h"

int main(void) {
    TSC_INIT();
    String _lit_0[] = {STR_LIT("a"), STR_LIT("b")};
    Array_string a = {.data = _lit_0, .length = 2, .capacity = 2};
    tsc_array_resize_string(&a, 4, STR_LIT("_"));
    printf("%zu\n", a.length);
    printf("%s\n", a.data[2].data);
    printf("%s\n", a.data[3].data);
    tsc_array_free_string(&a);
    return 0;
}
