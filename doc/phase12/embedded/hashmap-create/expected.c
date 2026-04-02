#include "runtime.h"
#include "std/embedded.h"

typedef struct {
    String keys[64];
    int32_t values[64];
    bool used[64];
    size_t capacity;
    size_t count;
} HashMap_string_i32;

int main(void) {
    TSC_INIT();
    HashMap_string_i32 m = {.capacity = 64};
    printf("%s\n", tsc_hashmap_has_string_i32(&m, STR_LIT("x")) ? "true" : "false");
    return 0;
}
