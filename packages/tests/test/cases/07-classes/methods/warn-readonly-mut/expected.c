#include "runtime.h"

typedef struct { int32_t count; } Counter;

static Counter Counter_new(int32_t c) {
    Counter self = {0};
    self.count = c;
    return self;
}

static void Counter_inc(Counter *self) {
    printf("%d\n", self->count);
}

int main(void) {
    TSC_INIT();
    Counter c = Counter_new(42);
    Counter_inc(&c);
    return 0;
}
