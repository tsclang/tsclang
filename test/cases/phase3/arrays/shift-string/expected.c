#include "runtime.h"

typedef struct { bool has_value; String value; } opt_string;

int main(void) {
    TSC_INIT();
    String _lit_0[] = {STR_LIT("hello"), STR_LIT("world")};
    Array_string arr = {.data = _lit_0, .length = 2, .capacity = 2};
    opt_string first = tsc_array_shift_string(&arr);
    printf("%s\n", first.has_value ? first.value.data : "null");
    printf("%zu\n", arr.length);
    return 0;
}
