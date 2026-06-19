#include "runtime.h"

static String _lambda_0_string(String acc, String *s) {
    return tsc_string_concat(acc, (*s));
}

int main(void) {
    TSC_INIT();
    String _lit_0[] = {STR_LIT("a"), STR_LIT("b"), STR_LIT("c")};
    const Array_string arr = {.data = _lit_0, .length = 3, .capacity = 3};
    const String result = tsc_array_reduce_string_string(arr, _lambda_0_string, STR_LIT(""));
    printf("%s\n", result.data);
    tsc_string_release(result);
    return 0;
}
