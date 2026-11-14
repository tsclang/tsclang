#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

static inline bool tsc_array_eq_i32(Array_i32 a, Array_i32 b) {
    if (a.length != b.length) return false;
    if (a.length == 0) return true;
    return memcmp(a.data, b.data, a.length * sizeof(int32_t)) == 0;
}

int main(void) {
    TSC_INIT();
    int32_t _lit_0[] = {1, 2};
    Array_i32 a = {.data = _lit_0, .length = 2, .capacity = 2};
    int32_t _lit_1[] = {1, 2};
    Array_i32 b = {.data = _lit_1, .length = 2, .capacity = 2};
    int32_t _lit_2[] = {1};
    Array_i32 c = {.data = _lit_2, .length = 1, .capacity = 1};
    Array_i32 d = {.data = NULL, .length = 0, .capacity = 0};
    Array_i32 e = {.data = NULL, .length = 0, .capacity = 0};
    int32_t _lit_3[] = {2, 1};
    Array_i32 f = {.data = _lit_3, .length = 2, .capacity = 2};
    printf("%s\n", (tsc_array_eq_i32(a, b)) ? "true" : "false");
    printf("%s\n", (tsc_array_eq_i32(a, c)) ? "true" : "false");
    printf("%s\n", (!tsc_array_eq_i32(a, c)) ? "true" : "false");
    printf("%s\n", (tsc_array_eq_i32(a, f)) ? "true" : "false");
    printf("%s\n", (tsc_array_eq_i32(d, e)) ? "true" : "false");
    printf("%s\n", (!tsc_array_eq_i32(d, e)) ? "true" : "false");
    return 0;
}
