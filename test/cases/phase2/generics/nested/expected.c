#include "runtime.h"

typedef struct { int32_t value; } Box_i32;
typedef struct { Box_i32 inner; } Wrapper_i32;

static Box_i32 Box_i32_new(int32_t v) {
    Box_i32 self = {0};
    self.value = v;
    return self;
}

static Wrapper_i32 Wrapper_i32_new(int32_t val) {
    Wrapper_i32 self = {0};
    self.inner = Box_i32_new(val);
    return self;
}

int main(void) {
    TSC_INIT();
    Wrapper_i32 w = Wrapper_i32_new(99);
    printf("%d\n", w.inner.value);
    return 0;
}
