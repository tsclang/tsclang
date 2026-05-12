#include "runtime.h"

typedef struct { uint8_t size; uint8_t color; } Brush;

int main(void) {
    TSC_INIT();
    Brush b = {0};
    b.size = 2;
    b.color = 0xFF;
    return 0;
}
