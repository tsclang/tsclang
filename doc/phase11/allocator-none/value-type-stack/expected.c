#include "runtime.h"

typedef struct { int32_t x; int32_t y; } Node;

int main(void) {
    TSC_INIT();
    Node n = {.x = 0, .y = 0};
    printf("%d\n", n.x);
    return 0;
}
