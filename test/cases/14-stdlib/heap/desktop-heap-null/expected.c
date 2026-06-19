#include "runtime.h"
#include <stdlib.h>

typedef struct { int32_t value; } Node;

static Node Node_new(int32_t v) {
    Node self = {0};
    self.value = v;
    return self;
}

static void Node_destructor(Node *n) {
}

int32_t _tsc_main(void) {
    Node *_heap_0 = (Node *)tsc_malloc(sizeof(Node));
    *_heap_0 = Node_new(42);
    Node *n = _heap_0;
    const int32_t v = n->value;
    n = NULL;
    int32_t _ret_1 = v;
    if (n != NULL) { Node_destructor(n); tsc_free(n); }
    return _ret_1;
}

int main(void) {
    TSC_INIT();
    printf("%d\n", _tsc_main());
    return _tsc_main();
}
