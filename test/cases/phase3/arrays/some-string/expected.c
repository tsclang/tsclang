#include "runtime.h"

static bool _lambda_0_bool(String *s) {
    return s->length > 1;
}

int main(void) {
    TSC_INIT();
    String _lit_0[] = {STR_LIT("a"), STR_LIT("bb"), STR_LIT("c")};
    const Array_string arr = {.data = _lit_0, .length = 3, .capacity = 3};
    printf("%s\n", tsc_array_some_string(arr, _lambda_0_bool) ? "true" : "false");
    return 0;
}
