#include "runtime.h"

int main(void) {
    TSC_INIT();
    String _lit_0[] = {STR_LIT("a"), STR_LIT("b"), STR_LIT("c")};
    Array_string a = {.data = _lit_0, .length = 3, .capacity = 3};
    tsc_array_reallocate_string(&a, 6);
    printf("%zu\n", a.capacity);
    printf("%zu\n", a.length);
    tsc_array_free_string(&a);
    return 0;
}
