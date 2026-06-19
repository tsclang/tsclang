#include "runtime.h"
#include <stdlib.h>

typedef struct Node Node;
struct Node { int32_t value; Node *next; };

static Node Node_new(int32_t v) {
    Node self = {0};
    self.value = v;
    self.next = NULL;
    return self;
}

static void Node_destructor(Node *n) {
}

int32_t _tsc_main(void) {
    Node *_heap_0 = (Node *)tsc_malloc(sizeof(Node));
    *_heap_0 = Node_new(1);
    Node *root = _heap_0;
    Node *_heap_1 = (Node *)tsc_malloc(sizeof(Node));
    *_heap_1 = Node_new(2);
    Node *child = _heap_1;
    child->next = root;
    int32_t _ret_2 = root->value;
    if (child != NULL) { Node_destructor(child); tsc_free(child); }
    if (root != NULL) { Node_destructor(root); tsc_free(root); }
    return _ret_2;
}

int main(void) {
    TSC_INIT();
    printf("%d\n", _tsc_main());
    return _tsc_main();
}
