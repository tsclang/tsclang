#include "runtime.h"

typedef struct { double *data; size_t length; size_t capacity; } Array_f64;

static inline bool tsc_array_eq_f64(Array_f64 a, Array_f64 b) {
    if (a.length != b.length) return false;
    if (a.length == 0) return true;
    for (size_t _i_ = 0; _i_ < a.length; _i_++) { if (a.data[_i_] != b.data[_i_]) return false; } return true;
}

int main(void) {
    TSC_INIT();
    double _lit_0[] = {NAN, 0.0};
    Array_f64 a = {.data = _lit_0, .length = 2, .capacity = 2};
    double _lit_1[] = {NAN, 0.0};
    Array_f64 b = {.data = _lit_1, .length = 2, .capacity = 2};
    printf("%s\n", (tsc_array_eq_f64(a, b)) ? "true" : "false");
    printf("%s\n", (!tsc_array_eq_f64(a, b)) ? "true" : "false");
    double _lit_2[] = {0.0};
    Array_f64 z1 = {.data = _lit_2, .length = 1, .capacity = 1};
    double _lit_3[] = {-0.0};
    Array_f64 z2 = {.data = _lit_3, .length = 1, .capacity = 1};
    printf("%s\n", (tsc_array_eq_f64(z1, z2)) ? "true" : "false");
    return 0;
}
