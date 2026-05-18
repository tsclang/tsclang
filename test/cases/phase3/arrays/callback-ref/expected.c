#include "runtime.h"

typedef struct { String *data; size_t length; size_t capacity; } Array_string;

static void _lambda_0(String *s) {
    printf("%.*s\n", (int)(*s).length, (*s).data);
}

int main(void) {
    TSC_INIT();
    String _lit_0[] = {STR_LIT("hello"), STR_LIT("world")};
    Array_string arr = {.data = _lit_0, .length = 2, .capacity = 2};
    tsc_array_foreach_string(arr, _lambda_0);
    return 0;
}
