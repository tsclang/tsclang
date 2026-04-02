#include "runtime.h"

typedef struct { void *_data; size_t size; } Map_string_i32;

int main(void) {
    TSC_INIT();
    const Map_string_i32 m = tsc_map_create_string_i32();
    printf("%zu\n", m.size);
    tsc_map_free_string_i32(&m);
    return 0;
}
