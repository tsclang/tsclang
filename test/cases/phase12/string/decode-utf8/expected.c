#include "runtime.h"

int main(void) {
    TSC_INIT();
    uint8_t _lit_0[] = {104, 105};
    const Array_u8 bytes = {.data = _lit_0, .length = 2, .capacity = 2};
    String s = tsc_decode_utf8(bytes);
    printf("%s\n", s.data);
    tsc_string_release(s);
    return 0;
}
