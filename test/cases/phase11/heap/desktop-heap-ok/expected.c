#include "runtime.h"
#include <stdlib.h>

typedef struct { int32_t value; } Box;

static Box Box_new(int32_t v) {
    Box self = {0};
    self.value = v;
    return self;
}

int32_t _tsc_main(void) {
    Box *_heap_0 = (Box *)tsc_malloc(sizeof(Box));
    *_heap_0 = Box_new(42);
    Box *b = _heap_0;
    return b->value;
}

int main(void) {
    TSC_INIT();
    printf("%d\n", _tsc_main());
    return _tsc_main();
}
