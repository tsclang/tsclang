#include "runtime.h"

typedef struct { uint8_t *data; size_t size; String type; } Blob;

int main(void) {
    TSC_INIT();
    uint8_t _blob_data_0[] = {0xAB, 0xCD};
    const Blob b = {.data = _blob_data_0, .size = 2, .type = STR_LIT("application/octet-stream")};
    printf("%s\n", b.type.data);
    return 0;
}
