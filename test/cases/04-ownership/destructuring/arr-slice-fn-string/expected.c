#include "runtime.h"

Array_string takeNames_ref_Array_string(const Array_string *names) {
    return tsc_array_slice_string((*names), 1, (int32_t)(*names).length);
}

int main(void) {
    TSC_INIT();
    String _lit_0[] = {STR_LIT("Alice"), STR_LIT("Bob"), STR_LIT("Carol")};
    const Array_string src = {.data = _lit_0, .length = 3, .capacity = 3};
    const Array_string rest = takeNames_ref_Array_string(&src);
    printf("%s\n", rest.data[0].data);
    printf("%s\n", src.data[0].data);
    return 0;
}
