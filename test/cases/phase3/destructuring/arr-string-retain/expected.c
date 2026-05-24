#include "runtime.h"

int main(void) {
    TSC_INIT();
    String _lit_0[] = {STR_LIT("Alice"), STR_LIT("Bob")};
    const Array_string names = {.data = _lit_0, .length = 2, .capacity = 2};
    const String first = names.data[0];
    tsc_string_retain(first);
    const String second = names.data[1];
    tsc_string_retain(second);
    printf("%s\n", first.data);
    printf("%s\n", second.data);
    tsc_string_release(second);
    tsc_string_release(first);
    return 0;
}
