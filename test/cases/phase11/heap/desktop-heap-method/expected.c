#include "runtime.h"
#include <stdlib.h>

typedef struct { int32_t count; } Counter;

static Counter Counter_new(void) {
    Counter self = {0};
    self.count = 0;
    return self;
}

static void Counter_increment(Counter *self) {
    self->count = self->count + 1;
}

static int32_t Counter_get(const Counter *self) {
    return self->count;
}

int32_t _tsc_main(void) {
    Counter *_heap_0 = (Counter *)tsc_malloc(sizeof(Counter));
    *_heap_0 = Counter_new();
    Counter *c = _heap_0;
    c.increment();
    c.increment();
    return c.get();
}

int main(void) {
    TSC_INIT();
    printf("%d\n", _tsc_main());
    return _tsc_main();
}
