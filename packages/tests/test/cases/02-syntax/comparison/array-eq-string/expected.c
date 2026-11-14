#include "runtime.h"

static inline bool tsc_array_eq_string(Array_string a, Array_string b) {
    if (a.length != b.length) return false;
    if (a.length == 0) return true;
    for (size_t _i_ = 0; _i_ < a.length; _i_++) { if (!tsc_string_eq(a.data[_i_], b.data[_i_])) return false; } return true;
}

int main(void) {
    TSC_INIT();
    String _lit_0[] = {STR_LIT("a"), STR_LIT("b")};
    Array_string a = {.data = _lit_0, .length = 2, .capacity = 2};
    String _lit_1[] = {STR_LIT("a"), STR_LIT("b")};
    Array_string b = {.data = _lit_1, .length = 2, .capacity = 2};
    String _lit_2[] = {STR_LIT("a"), STR_LIT("c")};
    Array_string c = {.data = _lit_2, .length = 2, .capacity = 2};
    printf("%s\n", (tsc_array_eq_string(a, b)) ? "true" : "false");
    printf("%s\n", (tsc_array_eq_string(a, c)) ? "true" : "false");
    printf("%s\n", (!tsc_array_eq_string(a, c)) ? "true" : "false");
    return 0;
}
