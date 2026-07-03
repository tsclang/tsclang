#include "runtime.h"

typedef struct Node Node;
struct Node { int32_t value; Node * next; };

int main(void) {
    TSC_INIT();
    Node a = { .value = 42, .next = NULL };
    printf("%d\n", a.value);
    return 0;
}
