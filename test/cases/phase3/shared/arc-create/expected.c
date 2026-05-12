#include "runtime.h"

typedef struct { int32_t _refcount; int32_t value; } Node;

int main(void) {
    TSC_INIT();
    Node *x = tsc_arc_alloc(sizeof(Node));
    x->value = 0;
    x->value = 10;
    printf("%d\n", x->value);
    tsc_arc_release(x);
    return 0;
}
