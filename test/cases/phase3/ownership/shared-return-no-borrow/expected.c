#include "runtime.h"

typedef struct { int32_t _refcount; int32_t value; } Node;

Node *share_shared_Node(Node *n) {
    return n;
}

int main(void) {
    TSC_INIT();
    Node *x = tsc_arc_alloc(sizeof(Node));
    x->value = 0;
    x->value = 42;
    const Node *s = share_shared_Node(x);
    x->value = 99;
    printf("%d\n", x->value);
    tsc_arc_release(x);
    return 0;
}
