#include "runtime.h"

typedef struct { uint8_t *ptr; size_t length; } Slice_u8;

int main(void) {
    TSC_INIT();
    const String s = STR_LIT("ABC");
    Slice_u8 b = {.ptr = (uint8_t *)s.data, .length = s.length};
    printf("%zu\n", b.length);
    return 0;
}
