#include "runtime.h"

typedef struct { d32_t *data; size_t length; size_t capacity; } Array_d32;

int main(void) {
    TSC_INIT();
    d32_t _lit_0[] = {15000, 25000};
    Array_d32 arr = {.data = _lit_0, .length = 2, .capacity = 2};
    return 0;
}
