#include "runtime.h"

typedef struct { bool has_value; String *value; } opt_ref_string;

static bool _lambda_0_bool(String s) {
    return s.length > 1;
}

int main(void) {
    TSC_INIT();
    String _lit_0[] = {STR_LIT("a"), STR_LIT("bb"), STR_LIT("c")};
    const Array_string arr = {.data = _lit_0, .length = 3, .capacity = 3};
    opt_ref_string found = tsc_array_find_last_string(arr, _lambda_0_bool);
    printf("%s\n", found.has_value ? found.value->data : "null");
    return 0;
}
