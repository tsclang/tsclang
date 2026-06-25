#include "runtime.h"

int main(void) {
    TSC_INIT();
    String _lit_0[] = {STR_LIT("a"), STR_LIT("b"), STR_LIT("c")};
    const Array_string arr = {.data = _lit_0, .length = 3, .capacity = 3};
    String removed = tsc_array_remove_string(&arr, 1);
    printf("%s\n", removed.data);
    printf("%zu\n", arr.length);
    Array_string cloned = tsc_array_slice_string(arr, 0, (int32_t)arr.length);
    printf("%zu\n", cloned.length);
    tsc_array_free_string(&cloned);
    tsc_string_release(removed);
    return 0;
}
