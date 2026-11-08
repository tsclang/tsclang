#include "runtime.h"

typedef struct { int32_t _refcount; int32_t _weakcount; int32_t v; } Box;

int main(void) {
    TSC_INIT();
    Box *a = tsc_arc_alloc(sizeof(Box));
    a->v = 7;
    printf("%d\n", a->v);
    Box *b = tsc_arc_alloc(sizeof(Box));
    b->v = 7;
    printf("%d\n", b->v);
    tsc_arc_release(b);
    tsc_arc_release(a);
    return 0;
}
