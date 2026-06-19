#include "runtime.h"

typedef struct { int32_t x; int32_t y; } Sprite;

static Sprite _sprite_pool[16];
static uint16_t _sprite_pool_mask = 0;

int main(void) {
    TSC_INIT();
    return 0;
}
