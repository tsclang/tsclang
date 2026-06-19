#include "runtime.h"

typedef struct {
    uint8_t keys[32];
    int32_t values[32];
    bool used[32];
    size_t capacity;
    size_t count;
} StaticMap_u8_i32;

static StaticMap_u8_i32 m = {.capacity = 32};

int main(void) {
    TSC_INIT();
    return 0;
}
