#include "runtime.h"

int main(void) {
    TSC_INIT();
    String _lit_0[] = {STR_LIT("a"), STR_LIT("b"), STR_LIT("c"), STR_LIT("d"), STR_LIT("e")};
    Array_string a = {.data = _lit_0, .length = 5, .capacity = 5};
    tsc_array_fill_string(&a, STR_LIT("x"), 1, 3);
    printf("%s\n", a.data[0].data);
    printf("%s\n", a.data[1].data);
    printf("%s\n", a.data[2].data);
    printf("%s\n", a.data[3].data);
    return 0;
}
