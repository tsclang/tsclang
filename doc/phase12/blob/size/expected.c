#include "runtime.h"

typedef struct { uint8_t *data; size_t size; } Blob;

int main(void) {
    TSC_INIT();
    uint8_t _blob_data_0[] = {1, 2, 3};
    const Blob b = {.data = _blob_data_0, .size = 3};
    printf("%zu\n", b.size);
    return 0;
}
