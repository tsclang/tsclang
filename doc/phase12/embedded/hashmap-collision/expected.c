#include "runtime.h"
#include "std/embedded.h"

typedef struct {
    String keys[4]; int32_t values[4]; bool used[4];
    size_t capacity; size_t count;
} HashMap_string_i32;
typedef struct { bool has_value; int32_t value; } opt_i32;

int main(void) {
    TSC_INIT();
    HashMap_string_i32 m = {.capacity = 4};
    tsc_hashmap_set_string_i32(&m, STR_LIT("a"), 1);
    tsc_hashmap_set_string_i32(&m, STR_LIT("b"), 2);
    tsc_hashmap_set_string_i32(&m, STR_LIT("c"), 3);
    opt_i32 _v = tsc_hashmap_get_string_i32(&m, STR_LIT("b"));
    printf("%s\n", (_v.has_value) ? "true" : "false");
    return 0;
}
