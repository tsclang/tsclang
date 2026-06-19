#include "runtime.h"

typedef struct { String _keys[64]; Array_string _vals[64]; size_t size; } TscMap_string_array_string;

static String _lambda_0_string(String *s) {
    return tsc_string_char_at((*s), 0);
}

int main(void) {
    TSC_INIT();
    String _lit_0[] = {STR_LIT("apple"), STR_LIT("avocado"), STR_LIT("banana"), STR_LIT("blueberry"), STR_LIT("cherry")};
    const Array_string arr = {.data = _lit_0, .length = 5, .capacity = 5};
    const TscMap_string_array_string grouped = tsc_map_group_by_string(arr, _lambda_0_string);
    printf("%zu\n", grouped.size);
    return 0;
}
