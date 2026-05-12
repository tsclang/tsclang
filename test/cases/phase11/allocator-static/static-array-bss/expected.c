#include "runtime.h"

typedef struct { int32_t x; int32_t y; } Sprite;

static Sprite sprites_data[64];
static struct { Sprite *data; size_t length; size_t capacity; } sprites = {
    .data = sprites_data, .length = 0, .capacity = 64
};

int main(void) {
    TSC_INIT();
    return 0;
}
