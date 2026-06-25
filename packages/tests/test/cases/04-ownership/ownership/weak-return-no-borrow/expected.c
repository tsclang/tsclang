#include "runtime.h"

typedef struct Node Node;
struct Node { int32_t _refcount; int32_t _weakcount; int32_t value; Node *next; Node *prev; };

Node *getWeak_weak_Node(Node *n) {
    return n;
}

int main(void) {
    TSC_INIT();
    Node *a = tsc_arc_alloc(sizeof(Node));
    a->value = 0;
    a->next = 0;
    a->prev = 0;
    a->value = 1;
    Node *b = tsc_arc_alloc(sizeof(Node));
    b->value = 0;
    b->next = 0;
    b->prev = 0;
    b->value = 2;
    b->prev = a;
    const Node *w = getWeak_weak_Node(b->prev);
    a->value = 99;
    printf("%d\n", a->value);
    tsc_arc_release(b);
    tsc_arc_release(a);
    return 0;
}
