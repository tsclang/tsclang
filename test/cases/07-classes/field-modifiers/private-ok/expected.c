#include "runtime.h"

typedef struct { int32_t count; } Counter;

static Counter Counter_new(void) {
    Counter self = {0};
    self.count = 0;
    return self;
}

static void Counter_increment(Counter *self) {
    self->count = self->count + 1;
}

static int32_t Counter_getCount(const Counter *self) {
    return self->count;
}

int main(void) {
    TSC_INIT();
    Counter c = Counter_new();
    Counter_increment(&c);
    Counter_increment(&c);
    printf("%d\n", Counter_getCount(&c));
    return 0;
}
