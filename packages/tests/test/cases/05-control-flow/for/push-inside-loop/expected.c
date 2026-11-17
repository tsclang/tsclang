#include "runtime.h"

typedef struct { double *data; size_t length; size_t capacity; } Array_f64;

int main(void) {
    TSC_INIT();
    const Array_f64 total = {.data = NULL, .length = 0, .capacity = 0};
    for (double i = 0; i < 5; i++) {
        tsc_array_push_f64(&total, i * 2);
    }
    printf("%zu\n", total.length);
    tsc_array_free_f64(&total);
    return 0;
}
