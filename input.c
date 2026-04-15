#include "runtime.h"

typedef struct { int32_t value; int32_t _refcount; } Node;

int main(void) {
    TSC_INIT();
    Node *x = tsc_arc_alloc(sizeof(Node));
    x->_refcount = 1;
    x->value = 0;
    tsc_arc_release((void **)&x);
    return 0;
}
