#include "runtime.h"

typedef struct { int32_t _refcount; int32_t value; } Node;

int32_t view_ref_Node(const Node *n) {
    return n->value;
}

int main(void) {
    TSC_INIT();
    Node *x = tsc_arc_alloc(sizeof(Node));
    x->value = 0;
    x->value = 42;
    printf("%d\n", view_ref_Node(x));
    tsc_arc_release(x);
    return 0;
}
