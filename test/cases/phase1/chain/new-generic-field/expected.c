#include "runtime.h"

typedef struct { int32_t value; } Box_i32;

static Box_i32 Box_i32_new(int32_t v) {
    Box_i32 self = {0};
    self.value = v;
    return self;
}

int main(void) {
    TSC_INIT();
    printf("%d\n", Box_i32_new(42).value);
    return 0;
}
