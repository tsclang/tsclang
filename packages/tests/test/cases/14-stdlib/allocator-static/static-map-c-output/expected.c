#include "runtime.h"

typedef struct {
    uint8_t keys[16];
    int32_t values[16];
    bool used[16];
    size_t capacity;
    size_t count;
} StaticMap_u8_i32;

static StaticMap_u8_i32 m = {.capacity = 16};

int main(void) {
    TSC_INIT();
    tsc_staticmap_set_u8_i32(&m, 1, 100);
    return 0;
}
