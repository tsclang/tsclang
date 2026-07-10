#include "runtime.h"

typedef struct { uint8_t a; int64_t b; uint8_t c; } BadLayout;

int main(void) {
    TSC_INIT();
    return 0;
}
