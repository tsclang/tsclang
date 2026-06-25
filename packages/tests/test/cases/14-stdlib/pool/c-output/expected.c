#include "runtime.h"

typedef struct { uint8_t x; bool active; } Bullet;

static Bullet _bullet_pool[8];
static uint8_t _bullet_pool_mask = 0;

int main(void) {
    TSC_INIT();
    return 0;
}
