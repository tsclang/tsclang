#include "runtime.h"

static bool _lambda_0_bool(String s) {
    return s.length > 1;
}

int main(void) {
    TSC_INIT();
    String _lit_0[] = {STR_LIT("a"), STR_LIT("bb"), STR_LIT("ccc")};
    const Array_string arr = {.data = _lit_0, .length = 3, .capacity = 3};
    const int32_t idx = (int)tsc_array_find_last_index_string(arr, _lambda_0_bool);
    printf("%d\n", idx);
    return 0;
}
