#include "runtime.h"

int main(void) {
    TSC_INIT();
    String _lit_0[] = {STR_LIT("x"), STR_LIT("y")};
    const Array_string arr = {.data = _lit_0, .length = 2, .capacity = 2};
    const Array_string arr2 = tsc_array_flat_string(arr);
    printf("%zu\n", arr2.length);
    return 0;
}
