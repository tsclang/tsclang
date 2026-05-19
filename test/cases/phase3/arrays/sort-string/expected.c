#include "runtime.h"

int main(void) {
    TSC_INIT();
    String _lit_0[] = {STR_LIT("cherry"), STR_LIT("apple"), STR_LIT("banana")};
    Array_string arr = {.data = _lit_0, .length = 3, .capacity = 3};
    tsc_array_sort_string(&arr, NULL);
    printf("%s\n", arr.data[0].data);
    printf("%s\n", arr.data[2].data);
    return 0;
}
