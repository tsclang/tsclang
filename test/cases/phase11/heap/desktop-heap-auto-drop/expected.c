#include "runtime.h"
#include <stdlib.h>

typedef struct { int32_t value; } Box;

static void Box_destructor(Box *b) {
}

void make(void) {
    Box *_heap_0 = (Box *)tsc_malloc(sizeof(Box));
    *_heap_0 = Box_new();
    Box *a = _heap_0;
    a->value = 1;
    Box *_heap_1 = (Box *)tsc_malloc(sizeof(Box));
    *_heap_1 = Box_new();
    Box *b = _heap_1;
    b->value = 2;
    if (b != NULL) { Box_destructor(b); tsc_free(b); }
    if (a != NULL) { Box_destructor(a); tsc_free(a); }
}

int main(void) {
    TSC_INIT();
    make();
    printf("done\n");
    return 0;
}
