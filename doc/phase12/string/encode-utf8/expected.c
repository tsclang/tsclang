#include "runtime.h"

typedef struct { uint8_t *data; size_t length; size_t capacity; } Array_u8;

int main(void) {
    TSC_INIT();
    Array_u8 bytes = tsc_encode_utf8(STR_LIT("hi"));
    printf("%zu\n", bytes.length);
    return 0;
}
