#include "runtime.h"

int main(void) {
    TSC_INIT();
    String _lit_0[] = {STR_LIT("a"), STR_LIT("b"), STR_LIT("c"), STR_LIT("d")};
    Array_string arr = {.data = _lit_0, .length = 4, .capacity = 4};
    const Array_string removed = tsc_array_splice_string(&arr, 1, 2);
    printf("%zu\n", removed.length);
    printf("%zu\n", arr.length);
    return 0;
}
