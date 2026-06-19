#include "runtime.h"

typedef struct { int32_t value; } Box;

int main(void) {
    TSC_INIT();
    Box b = {0};
    b.value = 42;
    const Box *r1 = &b;
    const Box *r2 = &b;
    printf("%d\n", r1->value);
    printf("%d\n", r2->value);
    return 0;
}
