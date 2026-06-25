#include "runtime.h"

typedef struct Node Node;
struct Node { int32_t _refcount; int32_t _weakcount; int32_t value; Node *next; };

int main(void) {
    TSC_INIT();
    Node *n = tsc_arc_alloc(sizeof(Node));
    n->value = 1;
    n->next = NULL;
    Node *w = tsc_weak_create(n);
    printf("%d\n", n->value);
    tsc_weak_release(w);
    tsc_arc_release(n);
    return 0;
}
