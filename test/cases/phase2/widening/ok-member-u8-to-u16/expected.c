#include "runtime.h"

typedef struct { uint8_t x; } Foo;

int main(void) {
    TSC_INIT();
    Foo f = {0};
    uint16_t b = f.x;
    printf("%u\n", (unsigned)b);
    return 0;
}
