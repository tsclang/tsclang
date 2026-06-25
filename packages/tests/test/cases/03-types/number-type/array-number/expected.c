#include "runtime.h"

typedef struct { double *data; size_t length; size_t capacity; } Array_f64;

int main(void) {
    TSC_INIT();
    double _lit_0[] = {1.0, 2.0, 3.0};
    const Array_f64 nums = {.data = _lit_0, .length = 3, .capacity = 3};
    printf("%zu\n", nums.length);
    return 0;
}
