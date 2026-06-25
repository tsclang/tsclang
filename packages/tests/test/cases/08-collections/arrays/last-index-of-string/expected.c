#include "runtime.h"

int main(void) {
    TSC_INIT();
    String _lit_0[] = {STR_LIT("a"), STR_LIT("b"), STR_LIT("a"), STR_LIT("c")};
    const Array_string arr = {.data = _lit_0, .length = 4, .capacity = 4};
    const int32_t idx = (int)tsc_array_last_index_of_string(arr, STR_LIT("a"));
    printf("%d\n", idx);
    return 0;
}
