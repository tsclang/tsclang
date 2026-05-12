#include "runtime.h"

typedef struct { int32_t _refcount; int32_t value; } Node;

int main(void) {
    TSC_INIT();
    Node *a = tsc_arc_alloc(sizeof(Node));
    a->value = 42;
    Node *b = tsc_arc_retain(a);
    printf("%d\n", b->value);
    tsc_arc_release(b);
    tsc_arc_release(a);
    return 0;
}
