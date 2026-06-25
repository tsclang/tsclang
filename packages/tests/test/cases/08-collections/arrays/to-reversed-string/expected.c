#include "runtime.h"

int main(void) {
    TSC_INIT();
    String _lit_0[] = {STR_LIT("a"), STR_LIT("b"), STR_LIT("c")};
    const Array_string arr = {.data = _lit_0, .length = 3, .capacity = 3};
    const Array_string arr2 = tsc_array_to_reversed_string(arr);
    printf("%s\n", arr2.data[0].data);
    printf("%s\n", arr2.data[2].data);
    return 0;
}
