#include "runtime.h"

int main(void) {
    TSC_INIT();
    Array_u8 bytes = tsc_encode_utf8(STR_LIT("hi"));
    printf("%zu\n", bytes.length);
    return 0;
}
