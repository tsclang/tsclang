#include "runtime.h"
#include "std/embedded.h"

typedef struct {
    String keys[8]; int32_t values[8]; bool used[8];
    size_t capacity; size_t count;
} HashMap_string_i32;

int main(void) {
    TSC_INIT();
    HashMap_string_i32 m = {.capacity = 8};
    tsc_hashmap_set_string_i32(&m, STR_LIT("k"), 1);
    printf("%s\n", tsc_hashmap_has_string_i32(&m, STR_LIT("k")) ? "true" : "false");
    printf("%s\n", tsc_hashmap_has_string_i32(&m, STR_LIT("z")) ? "true" : "false");
    return 0;
}
