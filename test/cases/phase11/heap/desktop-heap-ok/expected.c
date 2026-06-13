#include "runtime.h"
#include <stdlib.h>

typedef struct { int32_t value; } Box;

static Box Box_new(int32_t v) {
    Box self = {0};
    self.value = v;
    return self;
}

static void Box_destructor(Box *b) {
}

int32_t _tsc_main(void) {
    Box *_heap_0 = (Box *)tsc_malloc(sizeof(Box));
    *_heap_0 = Box_new(42);
    Box *b = _heap_0;
    int32_t _ret_1 = b->value;
    if (b != NULL) { Box_destructor(b); tsc_free(b); }
    return _ret_1;
}

int main(void) {
    TSC_INIT();
    printf("%d\n", _tsc_main());
    return _tsc_main();
}
