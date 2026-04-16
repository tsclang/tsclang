#include "runtime.h"

typedef struct { int32_t value; } Box_i32;

static Box_i32 Box_i32_new(int32_t v) {
    Box_i32 self = {0};
    self.value = v;
    return self;
}

static int32_t Box_i32_get(Box_i32 *self) {
    return self->value;
}

int main(void) {
    TSC_INIT();
    Box_i32 b = Box_i32_new(42);
    printf("%d\n", Box_i32_get(&b));
    return 0;
}
