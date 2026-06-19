#include "runtime.h"

int main(void) {
    TSC_INIT();
    String _lit_0[] = {STR_LIT("a"), STR_LIT("b"), STR_LIT("c"), STR_LIT("d")};
    const Array_string arr = {.data = _lit_0, .length = 4, .capacity = 4};
    const Array_string arr2 = tsc_array_to_spliced_string(arr, 1, 2, STR_LIT("x"), STR_LIT("y"));
    printf("%zu\n", arr2.length);
    printf("%s\n", arr2.data[1].data);
    return 0;
}
