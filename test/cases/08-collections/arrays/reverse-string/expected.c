#include "runtime.h"

int main(void) {
    TSC_INIT();
    String _lit_0[] = {STR_LIT("a"), STR_LIT("b"), STR_LIT("c")};
    Array_string a = {.data = _lit_0, .length = 3, .capacity = 3};
    tsc_array_reverse_string(&a);
    printf("%s\n", a.data[0].data);
    printf("%s\n", a.data[2].data);
    return 0;
}
