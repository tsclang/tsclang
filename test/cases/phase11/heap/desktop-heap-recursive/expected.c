#include "runtime.h"
#include <stdlib.h>

typedef struct { int32_t value; Node *next; } Node;

static Node Node_new(int32_t v) {
    Node self = {0};
    self.value = v;
    self.next = NULL;
    return self;
}

int32_t _tsc_main(void) {
    Node *_heap_0 = (Node *)tsc_malloc(sizeof(Node));
    *_heap_0 = Node_new(1);
    Node *root = _heap_0;
    Node *_heap_1 = (Node *)tsc_malloc(sizeof(Node));
    *_heap_1 = Node_new(2);
    Node *child = _heap_1;
    child->next = root;
    return root->value;
}

int main(void) {
    TSC_INIT();
    printf("%d\n", _tsc_main());
    return _tsc_main();
}
