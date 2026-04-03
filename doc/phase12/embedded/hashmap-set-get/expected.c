#include "runtime.h"
#include "std/embedded.h"

typedef struct {
    String keys[16]; int32_t values[16]; bool used[16];
    size_t capacity; size_t count;
} HashMap_string_i32;
typedef struct { bool has_value; int32_t value; } opt_i32;

int main(void) {
    TSC_INIT();
    HashMap_string_i32 m = {.capacity = 16};
    tsc_hashmap_set_string_i32(&m, STR_LIT("a"), 42);
    opt_i32 v = tsc_hashmap_get_string_i32(&m, STR_LIT("a"));
    if (v.has_value) printf("%d\n", v.value);
    return 0;
}
