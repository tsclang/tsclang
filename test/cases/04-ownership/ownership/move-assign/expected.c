#include "runtime.h"

typedef struct { int32_t value; } Node;

int main(void) {
    TSC_INIT();
    Node a = {0};
    a.value = 42;
    Node b = a;
    a = (Node){0};
    printf("%d\n", b.value);
    return 0;
}
