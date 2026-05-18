#include "runtime.h"

int main(void) {
    TSC_INIT();
    String _lit_0[] = {STR_LIT("a"), STR_LIT("b"), STR_LIT("c")};
    const Array_string arr = {.data = _lit_0, .length = 3, .capacity = 3};
    const String val = tsc_array_at_string(arr, -1);
    printf("%s\n", val.data);
    tsc_string_release(val);
    return 0;
}
