#include "runtime.h"

static bool _lambda_0_bool(String *s) {
    return s->length > 5;
}

int main(void) {
    TSC_INIT();
    String _lit_0[] = {STR_LIT("apple"), STR_LIT("banana"), STR_LIT("cherry"), STR_LIT("date")};
    const Array_string arr = {.data = _lit_0, .length = 4, .capacity = 4};
    Array_string filtered = tsc_array_filter_string(arr, _lambda_0_bool);
    printf("%zu\n", filtered.length);
    tsc_array_free_string(&filtered);
    return 0;
}
