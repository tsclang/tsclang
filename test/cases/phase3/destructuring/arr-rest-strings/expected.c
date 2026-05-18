#include "runtime.h"

int main(void) {
    TSC_INIT();
    String _lit_0[] = {STR_LIT("Alice"), STR_LIT("Bob"), STR_LIT("Carol")};
    const Array_string names = {.data = _lit_0, .length = 3, .capacity = 3};
    const String first = names.data[0];
    Array_string rest = tsc_array_slice_string(names, 1, (int32_t)names.length);
    printf("%s\n", first.data);
    printf("%s\n", rest.data[0].data);
    printf("%zu\n", rest.length);
    tsc_array_free_string(&rest);
    return 0;
}
